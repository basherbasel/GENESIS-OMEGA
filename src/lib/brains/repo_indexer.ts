/**
 * Dependency-free, multi-language repository symbol indexer.
 *
 * Walks a real directory, extracts imports/exports/classes/functions/types
 * with line ranges, and produces a compact text view bounded by a token
 * budget so a local agent can inspect an existing repo without overflowing
 * its context window. Heuristic by design: regex-based, not a full parser.
 */

import fs from 'node:fs';
import path from 'node:path';

export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'struct' | 'enum' | 'trait' | 'module' | 'import';

export interface SymbolRecord {
  kind: SymbolKind;
  name: string;
  file: string;
  line: number;
  endLine: number;
}

export interface FileIndex {
  path: string;
  bytes: number;
  lines: number;
  language: string;
  imports: string[];
  symbols: SymbolRecord[];
}

export interface RepoIndex {
  root: string;
  files: FileIndex[];
  symbols: SymbolRecord[];
  truncated: boolean;
  warnings: string[];
}

export interface IndexOptions {
  maxFiles?: number;
  maxBytesPerFile?: number;
  excludedDirs?: string[];
}

interface SymbolPattern {
  kind: SymbolKind;
  regex: RegExp;
  group: number;
}

const LANGUAGE_BY_EXT: Record<string, { name: string; imports: RegExp; symbols: SymbolPattern[] }> = {
  '.ts': {
    name: 'typescript',
    imports: /(?:from\s+|require\(|import\()\s*['"]([^'"]+)['"]/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, group: 1 },
      { kind: 'class', regex: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, group: 1 },
      { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, group: 1 },
      { kind: 'type', regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, group: 1 },
      { kind: 'function', regex: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*=>/, group: 1 },
    ],
  },
  '.js': {
    name: 'javascript',
    imports: /(?:from\s+|require\(|import\()\s*['"]([^'"]+)['"]/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, group: 1 },
      { kind: 'class', regex: /^\s*class\s+([A-Za-z_$][\w$]*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/, group: 1 },
    ],
  },
  '.py': {
    name: 'python',
    imports: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, group: 1 },
      { kind: 'class', regex: /^\s*class\s+([A-Za-z_]\w*)/, group: 1 },
    ],
  },
  '.go': {
    name: 'go',
    imports: /^\s*import\s+"([^"]+)"/,
    symbols: [
      { kind: 'function', regex: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, group: 1 },
      { kind: 'type', regex: /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, group: 1 },
    ],
  },
  '.rs': {
    name: 'rust',
    imports: /^\s*use\s+([\w:]+)/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'struct', regex: /^\s*(?:pub\s+)?struct\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'enum', regex: /^\s*(?:pub\s+)?enum\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'trait', regex: /^\s*(?:pub\s+)?trait\s+([A-Za-z_]\w*)/, group: 1 },
    ],
  },
  '.c': {
    name: 'c',
    imports: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:typedef\s+)?struct\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^[A-Za-z_]\w*(?:\s+[\w:*<>&]+)*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/, group: 1 },
    ],
  },
  '.cpp': {
    name: 'cpp',
    imports: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:class|struct)\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^[A-Za-z_]\w*(?:\s+[\w:*<>&]+)*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/, group: 1 },
    ],
  },
  '.java': {
    name: 'java',
    imports: /^\s*import\s+([\w.]+)/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:public|private|protected|abstract|final)?\s*(class|interface)\s+([A-Za-z_]\w*)/, group: 2 },
      { kind: 'function', regex: /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*\(/, group: 1 },
    ],
  },
  '.cs': {
    name: 'csharp',
    imports: /^\s*using\s+([\w.]+)/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:public|internal|abstract|sealed)?\s*(class|interface|struct)\s+([A-Za-z_]\w*)/, group: 2 },
      { kind: 'function', regex: /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*\(/, group: 1 },
    ],
  },
  '.php': {
    name: 'php',
    imports: /^\s*(?:require(?:_once)?|include(?:_once)?|use)\s+['"]?([^\s;'"]+)/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:final\s+)?class\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:public|private|protected|static\s+)*function\s+([A-Za-z_]\w*)\s*\(/, group: 1 },
    ],
  },
  '.rb': {
    name: 'ruby',
    imports: /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/,
    symbols: [
      { kind: 'class', regex: /^\s*class\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*def\s+([A-Za-z_]\w*[?!]?)(\(|$)/, group: 1 },
    ],
  },
  '.lua': {
    name: 'lua',
    imports: /^\s*(?:require|dofile|loadfile)\s*\(?\s*['"]([^'"]+)['"]/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(/, group: 1 },
    ],
  },
  '.dart': {
    name: 'dart',
    imports: /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/,
    symbols: [
      { kind: 'class', regex: /^\s*(?:abstract\s+)?class\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:Future<[\w<>,\s]+>\s+)?(?:static\s+)?(?:void|int|double|String|bool|List<[\w<>,\s]+>|Map<[\w<>,\s,]+>|[A-Z]\w*)\s+([A-Za-z_]\w*)\s*\(/, group: 1 },
    ],
  },
  '.f90': {
    name: 'fortran',
    imports: /^\s*use\s+([A-Za-z_]\w*)/,
    symbols: [
      { kind: 'module', regex: /^\s*module\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:recursive\s+)?(?:subroutine|function)\s+([A-Za-z_]\w*)/, group: 1 },
    ],
  },
  '.f95': {
    name: 'fortran',
    imports: /^\s*use\s+([A-Za-z_]\w*)/,
    symbols: [
      { kind: 'module', regex: /^\s*module\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:recursive\s+)?(?:subroutine|function)\s+([A-Za-z_]\w*)/, group: 1 },
    ],
  },
  '.for': {
    name: 'fortran',
    imports: /^\s*use\s+([A-Za-z_]\w*)/,
    symbols: [
      { kind: 'module', regex: /^\s*module\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'function', regex: /^\s*(?:recursive\s+)?(?:subroutine|function)\s+([A-Za-z_]\w*)/, group: 1 },
    ],
  },
  '.pas': {
    name: 'pascal',
    imports: /^\s*uses\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:procedure|function)\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'class', regex: /^\s*type\s+([A-Za-z_]\w*)\s*=/, group: 1 },
    ],
  },
  '.pp': {
    name: 'pascal',
    imports: /^\s*uses\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/,
    symbols: [
      { kind: 'function', regex: /^\s*(?:procedure|function)\s+([A-Za-z_]\w*)/, group: 1 },
      { kind: 'class', regex: /^\s*type\s+([A-Za-z_]\w*)\s*=/, group: 1 },
    ],
  },
  '.cob': {
    name: 'cobol',
    imports: /^\s*copy\s+([A-Za-z0-9_-]+)/i,
    symbols: [
      { kind: 'function', regex: /^\s*program-id\.\s*([A-Za-z0-9_-]+)/i, group: 1 },
      { kind: 'function', regex: /^\s*([A-Za-z0-9_-]+)\s+section\./i, group: 1 },
    ],
  },
  '.cbl': {
    name: 'cobol',
    imports: /^\s*copy\s+([A-Za-z0-9_-]+)/i,
    symbols: [
      { kind: 'function', regex: /^\s*program-id\.\s*([A-Za-z0-9_-]+)/i, group: 1 },
      { kind: 'function', regex: /^\s*([A-Za-z0-9_-]+)\s+section\./i, group: 1 },
    ],
  },
};

function languageFor(fileName: string): { name: string; ext: string } | null {
  const ext = path.extname(fileName).toLowerCase();
  const alias = ext === '.tsx' || ext === '.jsx' ? '.ts' : ext === '.mjs' || ext === '.cjs' ? '.js' : ext;
  const entry = LANGUAGE_BY_EXT[alias];
  return entry ? { name: entry.name, ext: alias } : null;
}

/** Compact, budget-bounded text for an agent prompt. */
export function formatIndexForPrompt(index: RepoIndex, maxChars = 12_000): string {
  const lines: string[] = [`REPO ${index.root} files=${index.files.length} symbols=${index.symbols.length}`];
  for (const file of index.files) {
    lines.push(`FILE ${file.path} [${file.language}] lines=${file.lines}`);
    for (const imp of file.imports.slice(0, 20)) lines.push(`  IMPORT ${imp}`);
    for (const symbol of file.symbols.slice(0, 60)) {
      lines.push(`  ${symbol.kind.toUpperCase()} ${symbol.name} ${symbol.line}-${symbol.endLine}`);
    }
  }
  let text = lines.join('\n');
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + `\n...TRUNCATED (${index.symbols.length} symbols total)`;
  }
  return text;
}

export function indexRepository(rootDir: string, options: IndexOptions = {}): RepoIndex {
  const root = path.resolve(rootDir);
  const maxFiles = Math.max(1, options.maxFiles ?? 500);
  const maxBytes = Math.max(1024, options.maxBytesPerFile ?? 512 * 1024);
  const excluded = new Set(['.git', 'node_modules', 'dist', 'backups', 'test-results', 'playwright-report', ...(options.excludedDirs || [])]);
  const files: FileIndex[] = [];
  const warnings: string[] = [];
  let truncated = false;

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`repository root is not a directory: ${root}`);
  }

  const walk = (dir: string): void => {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      warnings.push(`cannot read ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
      const full = path.resolve(dir, entry.name);
      if (!full.startsWith(root + path.sep) && full !== root) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const language = languageFor(entry.name);
      if (!language) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > maxBytes) {
        warnings.push(`skipped oversized file ${path.relative(root, full)}`);
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      const source = LANGUAGE_BY_EXT[language.ext];
      if (!source) continue;
      const lines = content.split(/\r?\n/);
      const imports: string[] = [];
      const found: Array<{ kind: SymbolKind; name: string; line: number }> = [];
      lines.forEach((line, index) => {
        const importMatch = source.imports.exec(line);
        if (importMatch) {
          const value = importMatch[1] || importMatch[2];
          if (value && !imports.includes(value)) imports.push(value);
        }
        for (const pattern of source.symbols) {
          const match = pattern.regex.exec(line);
          if (!match) continue;
          const name = match[pattern.group];
          if (name) found.push({ kind: pattern.kind, name, line: index + 1 });
        }
      });
      found.sort((a, b) => a.line - b.line);
      const rel = path.relative(root, full).split(path.sep).join('/');
      const symbols: SymbolRecord[] = found.map((symbol, i) => ({
        kind: symbol.kind,
        name: symbol.name,
        file: rel,
        line: symbol.line,
        endLine: found[i + 1] ? found[i + 1].line - 1 : lines.length,
      }));
      files.push({ path: rel, bytes: stat.size, lines: lines.length, language: language.name, imports, symbols });
    }
  };

  walk(root);
  return {
    root,
    files,
    symbols: files.flatMap((f) => f.symbols),
    truncated,
    warnings,
  };
}
