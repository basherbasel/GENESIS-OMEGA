/**
 * Operational doctor for the personal workshop.
 *
 * Prints a [✓/✗/—] | Item | Details table and exits 0 only when every
 * non-skipped check passes. `--ci` skips host-only gates (local runtime,
 * downloaded model, .env, backup freshness, toolchains) while still enforcing
 * Node, disk, .gitignore and the secret scan — so CI never silently ignores
 * the doctor. Skipped gates are printed explicitly with `—`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkToolchains } from '../src/lib/toolchain_doctor';

interface Check {
  item: string;
  ok: boolean;
  detail: string;
  skipped?: boolean;
}

const CI_MODE = process.argv.includes('--ci');

/** Host-only checks are reported as `—` in CI instead of being deleted. */
function hostOnly(item: string, evaluate: () => Check): Check {
  if (CI_MODE) {
    return { item, ok: true, detail: 'skipped in CI (host-only gate)', skipped: true };
  }
  return evaluate();
}

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found above scripts/doctor.ts');
    dir = parent;
  }
}

function run(command: string, args: string[], cwd: string): { ok: boolean; output: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().replace(/\s+/g, ' ');
  return { ok: result.status === 0, output };
}

function latestBackupAgeDays(root: string): number | null {
  const dir = path.join(root, 'backups');
  if (!fs.existsSync(dir)) return null;
  const stamps = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const newest = stamps[0];
  if (!newest) return null;
  const m = newest.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const when = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
  return (Date.now() - when.getTime()) / 86_400_000;
}

async function main(): Promise<void> {
  const root = findProjectRoot();
  const checks: Check[] = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ item: 'Node.js >= 20', ok: nodeMajor >= 20, detail: `v${process.versions.node}` });

  checks.push(
    hostOnly('llama-cli / Ollama runtime', () => {
      const llama = run('llama-cli', ['--version'], root);
      const ollama = run('ollama', ['--version'], root);
      return {
        item: 'llama-cli / Ollama runtime',
        ok: llama.ok || ollama.ok,
        detail: llama.ok ? llama.output.slice(0, 60) : ollama.ok ? `${ollama.output} (llama-cli absent)` : 'none found',
      };
    }),
  );

  checks.push(
    hostOnly('Local model qwen2.5-coder:1.5b', () => {
      const listed = run('ollama', ['list'], root);
      const ok = listed.ok && listed.output.includes('qwen2.5-coder:1.5b');
      return {
        item: 'Local model qwen2.5-coder:1.5b',
        ok,
        detail: ok ? 'qwen2.5-coder:1.5b present' : 'qwen2.5-coder:1.5b missing',
      };
    }),
  );

  let freeBytes = 0;
  try {
    const stat = fs.statfsSync(root);
    freeBytes = stat.bavail * stat.bsize;
  } catch {
    freeBytes = 0;
  }
  const freeGb = freeBytes / 1024 ** 3;
  checks.push({ item: 'Free disk >= 5GB', ok: freeGb >= 5, detail: `${freeGb.toFixed(2)} GB` });

  checks.push(
    hostOnly('.env + local runtime config', () => {
      const envPath = path.join(root, '.env');
      let ok = false;
      let detail = '.env missing';
      if (fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf-8');
        const ollamaHost = /(?:^|\n)\s*OLLAMA_HOST\s*=\s*(.+)/.exec(envText)?.[1]?.trim();
        const llamaPath = /(?:^|\n)\s*LLAMA_CLI_PATH\s*=\s*(.+)/.exec(envText)?.[1]?.trim();
        ok = Boolean((ollamaHost && ollamaHost.length > 0) || (llamaPath && llamaPath.length > 0));
        detail = ok ? `.env OK (${ollamaHost ? 'OLLAMA_HOST' : 'LLAMA_CLI_PATH'})` : '.env has no OLLAMA_HOST / LLAMA_CLI_PATH';
      }
      return { item: '.env + local runtime config', ok, detail };
    }),
  );

  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const requiredPatterns = ['.env', '*.gguf', 'models/', 'backups/'];
  const missingPatterns = requiredPatterns.filter((p) => !gitignore.includes(p));
  checks.push({
    item: '.gitignore patterns',
    ok: missingPatterns.length === 0,
    detail: missingPatterns.length ? `missing: ${missingPatterns.join(', ')}` : '.env, *.gguf, models/, backups/',
  });

  const secrets = run(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/check-secrets.ts'], root);
  checks.push({ item: 'Secret scan', ok: secrets.ok, detail: secrets.output.slice(0, 120) || 'no output' });

  checks.push(
    hostOnly('Last backup < 7 days', () => {
      const age = latestBackupAgeDays(root);
      return {
        item: 'Last backup < 7 days',
        ok: age !== null && age >= 0 && age < 7,
        detail: age === null ? 'no backup found' : `${age.toFixed(2)} days`,
      };
    }),
  );

  checks.push(
    hostOnly('Toolchain ecosystems', () => {
      const report = checkToolchains();
      const missing = report.tools.filter((t) => !t.available);
      return {
        item: 'Toolchain ecosystems',
        ok: true,
        detail: `${report.readyEcosystems}/${report.totalEcosystems} ready · ${missing.length} absent (informational)`,
      };
    }),
  );

  console.log(`GENESIS-OMEGA — workshop doctor${CI_MODE ? ' (CI mode)' : ''}`);
  console.log('[✓/✗/—] | Item | Details');
  console.log('--------|-----|-------');
  for (const c of checks) {
    const mark = c.skipped ? '—' : c.ok ? '✓' : '✗';
    console.log(`[${mark}] | ${c.item.padEnd(28)} | ${c.detail}`);
  }

  const failed = checks.filter((c) => !c.ok && !c.skipped);
  const skipped = checks.filter((c) => c.skipped);
  const enforced = checks.length - skipped.length;
  console.log(
    `\ncritical: ${enforced - failed.length}/${enforced} passed` +
      (skipped.length ? ` · ${skipped.length} skipped in CI (reported, not ignored)` : ''),
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`DOCTOR_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
