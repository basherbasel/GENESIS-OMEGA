import type { DiffEntry, SbomComponent, SbomDocument, SecretFinding } from './types';

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { label: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { label: 'Stripe Live Key', regex: /sk_live_[A-Za-z0-9]{16,}/ },
  { label: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    label: 'Hardcoded Password/Secret',
    regex: /(?:api_key|secret_key|password|passwd|auth_token)\s*=\s*['"][^'"]{8,}['"]/i,
  },
];

const STATIC_SECURITY_RULES: Array<{ label: string; regex: RegExp }> = [
  { label: 'Dangerous eval()/exec() invocation', regex: /\b(?:eval|exec)\s*\(/ },
  { label: 'Unsafe shell=True execution', regex: /shell\s*=\s*True/ },
  { label: 'Potential SQL string interpolation', regex: /(?:SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*\+\s*[a-zA-Z_]/i },
];

const DIFF_IGNORED_FILES = new Set([
  'OMEGA_REPORT.md',
  'OMEGA_AUDIT_REPORT.html',
  'README.md',
  'sbom.json',
  'BENCHMARK_REPORT.json',
  'MIGRATION_REPORT.md',
]);

const CODE_SCAN_EXTENSIONS = new Set([
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.go',
  '.rs',
  '.java',
  '.php',
  '.rb',
  '.env',
  '.yml',
  '.yaml',
  '.sh',
  '.ps1',
  '.c',
  '.cpp',
  '.cs',
]);

export function isSafeRelativePath(relPath: string): string | null {
  const normalized = (relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    // Reject the .git directory itself, but allow harmless dotfiles such as
    // .gitignore and .github/workflows/ci.yml.
    if (part === '.' || part === '..' || part === '.git' || part === '__pycache__' || part === 'node_modules') {
      return null;
    }
    // A drive qualifier (C:) or UNC server share is absolute on Windows and
    // must never be treated as a path relative to the project root.
    if (/^[a-zA-Z]:$/.test(part) || /^[a-zA-Z]:/.test(normalized)) return null;
  }
  return parts.join('/');
}

// Pure synchronous SHA-256 implementation so SBOM hashing works identically in Node and Browser
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((val) => val.toString(16).padStart(8, '0'))
    .join('');
}

export function scanSecretsAndSecurity(files: Record<string, string>): {
  secrets: SecretFinding[];
  staticIssues: string[];
} {
  const secrets: SecretFinding[] = [];
  const staticIssues: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const dotIdx = filename.lastIndexOf('.');
    const ext = dotIdx !== -1 ? filename.slice(dotIdx).toLowerCase() : '';
    if (!CODE_SCAN_EXTENSIONS.has(ext)) continue;

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const { label, regex } of SECRET_PATTERNS) {
        if (regex.test(line)) {
          secrets.push({ file: filename, type: label, line: idx + 1 });
        }
      }
      for (const { label, regex } of STATIC_SECURITY_RULES) {
        if (regex.test(line)) {
          staticIssues.push(`${filename}:${idx + 1} — ${label}`);
        }
      }
    });
  }

  return { secrets, staticIssues };
}

export function generateCycloneDxSbom(title: string, files: Record<string, string>): SbomDocument {
  const { secrets } = scanSecretsAndSecurity(files);
  const components: SbomComponent[] = [];

  for (const [name, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (name === 'sbom.json') continue;
    const sizeBytes = new TextEncoder().encode(content).byteLength;
    components.push({
      type: 'file',
      name,
      sizeBytes,
      hashes: [{ alg: 'SHA-256', content: sha256Hex(content) }],
    });
  }

  const reqTxt = files['requirements.txt'];
  if (reqTxt) {
    for (const rawLine of reqTxt.split('\n')) {
      const pkg = rawLine.trim();
      if (pkg && !pkg.startsWith('#')) {
        components.push({ type: 'library', name: pkg, ecosystem: 'pypi' });
      }
    }
  }

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { name: title || 'omega-project', type: 'application' },
      tools: [{ name: 'GENESIS-OMEGA SBOM Guardian', version: '9.2' }],
    },
    components,
    securityAudit: {
      hardcodedSecretsDetected: secrets.length,
      findings: secrets,
      supplyChainStatus: secrets.length === 0 ? 'clean' : 'warning',
    },
  };
}

export function computeUnifiedDiffs(
  oldFiles: Record<string, string>,
  newFiles: Record<string, string>,
): DiffEntry[] {
  const keys = Array.from(new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)])).sort();
  const diffs: DiffEntry[] = [];

  for (const file of keys) {
    const baseName = file.split('/').pop() || file;
    if (DIFF_IGNORED_FILES.has(baseName)) continue;

    const oldTxt = oldFiles[file];
    const newTxt = newFiles[file];
    if (oldTxt === newTxt) continue;

    const oldLines = oldTxt !== undefined ? oldTxt.split('\n') : [];
    const newLines = newTxt !== undefined ? newTxt.split('\n') : [];
    const status: DiffEntry['status'] =
      oldTxt === undefined ? 'added' : newTxt === undefined ? 'removed' : 'modified';

    const header = [
      `--- ${oldTxt !== undefined ? `a/${file}` : '/dev/null'}`,
      `+++ ${newTxt !== undefined ? `b/${file}` : '/dev/null'}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ];

    const bodyLines: string[] = [];
    let added = 0;
    let removed = 0;

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === n) {
        if (o !== undefined) bodyLines.push(` ${o}`);
      } else {
        if (o !== undefined) {
          bodyLines.push(`-${o}`);
          removed += 1;
        }
        if (n !== undefined) {
          bodyLines.push(`+${n}`);
          added += 1;
        }
      }
    }

    diffs.push({
      file,
      status,
      added,
      removed,
      diffText: [...header, ...bodyLines].join('\n'),
    });
  }

  return diffs;
}

const DANGEROUS_RED_TEAM_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Destructive rm -rf invocation', regex: /\brm\s+-rf\b/i },
  { label: 'Recursive shutil.rmtree call', regex: /\bshutil\.rmtree\s*\(/ },
  { label: 'Direct os.system shell execution', regex: /\bos\.system\s*\(/ },
  { label: 'Subprocess shell execution', regex: /\bsubprocess\.(?:run|Popen|call|check_output)\s*\(/ },
  { label: 'Dynamic code execution eval/exec', regex: /\b(?:eval|exec)\s*\(/ },
  { label: 'Node child_process shell call', regex: /\bchild_process\b|\bexecSync\s*\(/ },
];

export function validateRedTeamScript(script: string): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lines = (script || '').split('\n');
  lines.forEach((line, idx) => {
    for (const { label, regex } of DANGEROUS_RED_TEAM_PATTERNS) {
      if (regex.test(line)) {
        violations.push(`Line ${idx + 1}: ${label}`);
      }
    }
  });
  return {
    safe: violations.length === 0,
    violations,
  };
}

export function evaluateWithAtomicRollback<T extends { score: number; secretsCount: number }>(
  baselineFiles: Record<string, string>,
  candidateFiles: Record<string, string>,
  evaluator: (files: Record<string, string>) => T,
): {
  files: Record<string, string>;
  evaluation: T;
  rollback: {
    applied: boolean;
    reason: string;
    baselineScore: number;
    candidateScore: number;
  };
} {
  const baselineEval = evaluator(baselineFiles);
  const candidateEval = evaluator(candidateFiles);

  const degraded =
    candidateEval.score < baselineEval.score ||
    candidateEval.secretsCount > baselineEval.secretsCount;

  if (degraded) {
    return {
      files: { ...baselineFiles },
      evaluation: baselineEval,
      rollback: {
        applied: true,
        reason: `تم التراجع الذري إلى اللقطة الآمنة السابقة (${baselineEval.score} -> ${candidateEval.score})`,
        baselineScore: baselineEval.score,
        candidateScore: candidateEval.score,
      },
    };
  }

  return {
    files: { ...candidateFiles },
    evaluation: candidateEval,
    rollback: {
      applied: false,
      reason: 'اجتازت التعديلات معايير التحقق دون تراجع في الجودة أو الأمان.',
      baselineScore: baselineEval.score,
      candidateScore: candidateEval.score,
    },
  };
}

