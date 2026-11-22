import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('doctor --ci enforces portable gates and reports host-only gates as skipped', () => {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/doctor.ts', '--ci'],
    { encoding: 'utf8', timeout: 60_000 },
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /CI mode/);
  assert.match(output, /\[—\] \| llama-cli \/ Ollama runtime/);
  assert.match(output, /Secret scan\s+\| SECRETS_OK findings=0/);
  assert.match(output, /critical: \d+\/\d+ passed · \d+ skipped in CI/);
});

test('doctor default mode keeps host-only gates enforced', () => {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/doctor.ts'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /qwen2\.5-coder:1\.5b present/);
  assert.doesNotMatch(output, /skipped in CI/);
});
