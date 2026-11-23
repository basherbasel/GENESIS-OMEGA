/**
 * Multi-language static taint analyzer (v3 Part 2).
 *
 * Tracks untrusted external sources into dangerous sinks across JS/TS, Python,
 * C/C++, PHP, Go, Java, C# and Ruby. Bounded, deterministic and dependency-free:
 * no execution of scanned code, no network, no simulated findings.
 */

import path from 'node:path';

export type TaintCwe = 'CWE-78' | 'CWE-89' | 'CWE-22' | 'CWE-94' | 'CWE-79';

export interface TaintFinding {
  id: string;
  file: string;
  line: number;
  source: string;
  sink: string;
  cweId: TaintCwe;
  remediation: string;
}

interface LanguageRules {
  name: string;
  sources: RegExp[];
  sinks: Array<{ cweId: TaintCwe; regex: RegExp; remediation: string }>;
}

const MAX_FILES = 120;
const MAX_LINES = 4_000;
const MAX_FINDINGS = 200;

const RULES: Record<string, LanguageRules> = {
  '.ts': {
    name: 'typescript',
    sources: [/\breq\.(?:body|query|params)\b/, /\bprocess\.argv\b/, /\blocation\.(?:hash|search)\b/],
    sinks: [
      { cweId: 'CWE-78', regex: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/, remediation: 'pass an argument vector to execFile with a sanitized environment' },
      { cweId: 'CWE-94', regex: /\b(?:eval|new\s+Function|Function)\s*\(/, remediation: 'replace dynamic evaluation with an explicit allow-list' },
      { cweId: 'CWE-89', regex: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*(?:\+|`|\$\{)/i, remediation: 'use parameterized queries with placeholders' },
      { cweId: 'CWE-79', regex: /\.innerHTML\s*=|\bdocument\.write\s*\(/, remediation: 'use textContent or an output encoder' },
      { cweId: 'CWE-22', regex: /\bfs\.(?:readFileSync|writeFileSync|unlinkSync|createReadStream)\s*\(/, remediation: 'validate with isSafeRelativePath before any filesystem call' },
    ],
  },
  '.js': { name: 'javascript', sources: [/\breq\.(?:body|query|params)\b/, /\bprocess\.argv\b/], sinks: [] },
  '.py': {
    name: 'python',
    sources: [/\bos\.environ\b/, /\bsys\.argv\b/, /\binput\s*\(/, /\brequest\.(?:args|form|data)\b/],
    sinks: [
      { cweId: 'CWE-78', regex: /\bos\.system\s*\(|\bsubprocess\.(?:run|call|Popen)\s*\(/, remediation: 'use subprocess with shell=False and an argument list' },
      { cweId: 'CWE-94', regex: /\beval\s*\(|\bexec\s*\(/, remediation: 'parse untrusted data with json.loads instead of eval' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*(?:\+|%|f['"])/i, remediation: 'use DB-API placeholders (?) instead of string interpolation' },
      { cweId: 'CWE-22', regex: /\bopen\s*\(|\bPath\s*\(/, remediation: 'resolve and confine the path under an allowed root' },
    ],
  },
  '.c': {
    name: 'c',
    sources: [/\bscanf\s*\(/, /\bgets\s*\(/, /\bgetenv\s*\(/, /\bargv\s*\[/],
    sinks: [
      { cweId: 'CWE-78', regex: /\bsystem\s*\(|\bpopen\s*\(/, remediation: 'use execv with a fixed argument vector' },
      { cweId: 'CWE-22', regex: /\bfopen\s*\(|\bopen\s*\(/, remediation: 'canonicalize and confine the path before opening' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*strcat/i, remediation: 'use prepared statements' },
    ],
  },
  '.cpp': { name: 'cpp', sources: [/\bstd::cin\b/, /\bgetenv\s*\(/, /\bargv\s*\[/], sinks: [] },
  '.php': {
    name: 'php',
    sources: [/\$_(?:GET|POST|REQUEST|COOKIE)\s*\[/],
    sinks: [
      { cweId: 'CWE-78', regex: /\b(?:exec|shell_exec|system|passthru)\s*\(|`/, remediation: 'use escapeshellarg or avoid shell execution' },
      { cweId: 'CWE-94', regex: /\beval\s*\(/, remediation: 'replace eval with a dispatch table' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*\.\s*\$/i, remediation: 'use PDO prepared statements' },
      { cweId: 'CWE-79', regex: /\becho\s+\$[A-Za-z_]\w*/, remediation: 'escape output with htmlspecialchars' },
      { cweId: 'CWE-22', regex: /\bfile_get_contents\s*\(|\bfopen\s*\(/, remediation: 'validate the path against realpath and an allowed root' },
    ],
  },
  '.go': {
    name: 'go',
    sources: [/\bos\.Args\b/, /\bos\.Getenv\s*\(/, /\br\.URL\.Query\s*\(/, /\br\.FormValue\s*\(/],
    sinks: [
      { cweId: 'CWE-78', regex: /\bexec\.Command\s*\(/, remediation: 'pass fixed arguments and a sanitized environment' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*(?:\+|fmt\.Sprintf)/i, remediation: 'use database/sql placeholders' },
      { cweId: 'CWE-22', regex: /\bos\.(?:Open|ReadFile|WriteFile)\s*\(/, remediation: 'validate with filepath.Clean and confine to an allowed root' },
    ],
  },
  '.java': {
    name: 'java',
    sources: [/\brequest\.getParameter\s*\(/, /\bSystem\.getenv\s*\(/, /\bargs\s*\[/],
    sinks: [
      { cweId: 'CWE-78', regex: /Runtime\.getRuntime\(\)\.exec\s*\(|ProcessBuilder\s*\(/, remediation: 'use ProcessBuilder with a fixed argument list' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*\+/i, remediation: 'use PreparedStatement placeholders' },
      { cweId: 'CWE-79', regex: /\.getWriter\(\)\.print(?:ln)?\s*\(/, remediation: 'encode output before writing to the response' },
      { cweId: 'CWE-22', regex: /\bnew\s+File(?:InputStream|OutputStream|Reader|Writer)?\s*\(/, remediation: 'canonicalize and confine the path' },
    ],
  },
  '.cs': {
    name: 'csharp',
    sources: [/\bRequest\.QueryString\b/, /\bEnvironment\.GetEnvironmentVariable\s*\(/, /\bargs\s*\[/],
    sinks: [
      { cweId: 'CWE-78', regex: /Process\.Start\s*\(/, remediation: 'use ProcessStartInfo.ArgumentList with a sanitized environment' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*\+/i, remediation: 'use parameterized SqlCommand' },
      { cweId: 'CWE-22', regex: /\bFile\.(?:ReadAllText|WriteAllText|OpenRead|Delete)\s*\(/, remediation: 'use Path.GetFullPath and confine to an allowed root' },
    ],
  },
  '.rb': {
    name: 'ruby',
    sources: [/\bparams\s*\[/, /\bENV\s*\[/, /\bARGV\b/],
    sinks: [
      { cweId: 'CWE-78', regex: /\b(?:system|exec|`)\b|\bKernel\.system\s*\(/, remediation: 'use system with an argument array, never a shell string' },
      { cweId: 'CWE-94', regex: /\beval\s*\(/, remediation: 'replace eval with send on an allow-listed method' },
      { cweId: 'CWE-89', regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*#\{/i, remediation: 'use ActiveRecord placeholders' },
      { cweId: 'CWE-22', regex: /\bFile\.(?:read|write|open|delete)\s*\(/, remediation: 'use File.expand_path and confine to an allowed root' },
    ],
  },
};

function rulesFor(file: string): LanguageRules | null {
  let key = path.extname(file).toLowerCase();
  const alias: Record<string, string> = { '.tsx': '.ts', '.jsx': '.js', '.mjs': '.js', '.cjs': '.js', '.cc': '.c', '.h': '.c', '.hpp': '.c' };
  key = alias[key] || key;
  const base = RULES[key];
  if (!base) return null;
  if (key === '.js' && RULES['.ts']) return RULES['.ts'];
  if (key === '.cpp' && RULES['.c']) return RULES['.c'];
  return base;
}

const SANITIZERS = /isSafeRelativePath|resolveSafeWatchPath|sanitize|escape|encodeURIComponent|htmlspecialchars|escapeshellarg|parameteriz|placeholder|Number\s*\(|parseInt\s*\(|Math\.floor\s*\(/i;

function taintedNames(line: string, sources: RegExp[], carried: Set<string>): Set<string> {
  const next = new Set(carried);
  const isSource = sources.some((regex) => regex.test(line));
  if (isSource) {
    const names = line.match(/\b[A-Za-z_$][\w$]*(?=\s*=(?!=))/g) || [];
    for (const name of names.slice(0, 8)) next.add(name);
  }
  return next;
}

function usesTainted(line: string, names: Set<string>): boolean {
  for (const name of names) {
    if (new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`).test(line)) return true;
  }
  return false;
}

/** Real per-line source-to-sink propagation with a conservative sanitizer gate. */
export function scanTaintFlows(
  files: Record<string, string>,
  options: { maxFiles?: number; maxFindings?: number } = {},
): TaintFinding[] {
  const findings: TaintFinding[] = [];
  const maxFiles = Math.max(1, options.maxFiles ?? MAX_FILES);
  const maxFindings = Math.max(1, options.maxFindings ?? MAX_FINDINGS);
  const entries = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0])).slice(0, maxFiles);

  for (const [file, raw] of entries) {
    const rules = rulesFor(file);
    if (!rules) continue;
    const lines = raw.split('\n').slice(0, MAX_LINES);
    let carried = new Set<string>();
    lines.forEach((line, index) => {
      const isSource = rules.sources.some((regex) => regex.test(line));
      carried = taintedNames(line, rules.sources, carried);
      if (SANITIZERS.test(line)) {
        for (const name of Array.from(carried)) if (line.includes(name)) carried.delete(name);
      }
      for (const sink of rules.sinks) {
        if (!sink.regex.test(line)) continue;
        const direct = isSource && usesTainted(line, carried);
        const propagated = usesTainted(line, carried);
        if (!direct && !propagated) continue;
        findings.push({
          id: `taint-${file}-${index + 1}-${sink.cweId}`,
          file,
          line: index + 1,
          source: isSource ? (rules.sources.find((regex) => regex.test(line))?.source || 'untrusted-input') : 'tainted-variable',
          sink: sink.regex.source,
          cweId: sink.cweId,
          remediation: sink.remediation,
        });
        if (findings.length >= maxFindings) return;
      }
    });
    if (findings.length >= maxFindings) break;
  }
  return findings;
}
