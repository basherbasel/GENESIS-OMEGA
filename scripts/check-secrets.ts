/**
 * Scan every git-tracked file for credential-shaped literals.
 *
 * Patterns require realistic token shapes so documentation examples and
 * placeholder text (e.g. `ghp_...`, `task-fullstack-py`) do not create noise.
 * Known documentation-only values are allow-listed explicitly below.
 * Exits 0 with zero findings, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { label: 'OpenAI-style key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: 'GitHub PAT', regex: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { label: 'Slack token', regex: /\bxoxb-[0-9A-Za-z-]{10,}\b/g },
];

// AWS's canonical documentation example, used inside generated scanner templates.
const ALLOWLIST = new Set(['AKIAIOSFODNN7EXAMPLE']);

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found above scripts/check-secrets.ts');
    dir = parent;
  }
}

function trackedFiles(root: string): string[] {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || 'git ls-files failed');
  return (result.stdout || '')
    .split('\0')
    .map((f) => f.replace(/\\/g, '/'))
    .filter(Boolean);
}

interface Finding {
  file: string;
  line: number;
  label: string;
  value: string;
}

function main(): void {
  const root = findProjectRoot();
  const findings: Finding[] = [];

  for (const file of trackedFiles(root)) {
    if (file === '.env.example') continue;
    const abs = path.join(root, file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    if (fs.statSync(abs).size > MAX_FILE_BYTES) continue;
    const content = fs.readFileSync(abs, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(lines[i])) !== null) {
          if (ALLOWLIST.has(match[0])) continue;
          findings.push({ file, line: i + 1, label: pattern.label, value: match[0] });
        }
      }
    }
  }

  if (findings.length === 0) {
    console.log('SECRETS_OK findings=0 scanned=' + trackedFiles(root).length);
    process.exit(0);
    return;
  }
  console.error(`SECRETS_FOUND findings=${findings.length}`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} ${f.label} -> ${f.value.slice(0, 24)}…`);
  }
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`SECRETS_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
