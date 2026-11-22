import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSandboxEnv } from './sandbox_runner';
import { isSafeRelativePath, sha256Hex } from './security';
import { verifyProjectWorkspace } from './verifier';
import { inspectWatchedDirectory } from './watcher';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('verifier never fabricates test counts when no test suite ran', async () => {
  const dir = tempDir('omega-verify-');
  try {
    const summary = await verifyProjectWorkspace(dir, { 'README.md': '# example' }, 'typescript');
    assert.equal(summary.ranRealTests, false);
    assert.equal(summary.testsExecuted, 0);
    assert.equal(summary.testsPassed, 0);
    assert.match(summary.outputSnippet, /no-test-suite/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('watcher reports only genuinely changed files', () => {
  const dir = tempDir('omega-watch-');
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'v1', 'utf-8');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'stable', 'utf-8');

    const first = inspectWatchedDirectory(dir, dir);
    assert.equal(first.ok, true);
    const firstHashes = first.inspection!.fileHashes;

    const unchanged = inspectWatchedDirectory(dir, dir, first.inspection!.treeHash, firstHashes);
    assert.equal(unchanged.changed, false);
    assert.deepEqual(unchanged.changedFiles, []);

    fs.writeFileSync(path.join(dir, 'a.txt'), 'v2', 'utf-8');
    fs.unlinkSync(path.join(dir, 'b.txt'));
    fs.writeFileSync(path.join(dir, 'c.txt'), 'new', 'utf-8');

    const changed = inspectWatchedDirectory(dir, dir, first.inspection!.treeHash, firstHashes);
    assert.equal(changed.changed, true);
    assert.deepEqual(new Set(changed.changedFiles), new Set(['a.txt', 'b.txt', 'c.txt']));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hand-rolled SHA-256 matches node:crypto for ASCII, Arabic and multi-block input', () => {
  const samples = [
    '',
    'abc',
    'مرحبا يا جينيسيس',
    'a'.repeat(1000),
    JSON.stringify({ nested: [1, 2, 3], text: ' اختبار ' }),
  ];
  for (const sample of samples) {
    const expected = createHash('sha256').update(sample, 'utf8').digest('hex');
    assert.equal(sha256Hex(sample), expected);
  }
});

test('relative path validator rejects Windows drive-qualified paths', () => {
  assert.equal(isSafeRelativePath('C:/Windows/System32/config'), null);
  assert.equal(isSafeRelativePath('D:evil.exe'), null);
  assert.equal(isSafeRelativePath('src/lib/main.ts'), 'src/lib/main.ts');
});

test('sandbox child environment strips secrets but keeps runtime essentials', () => {
  const previous = process.env.OMEGA_INTEGRITY_TEST_SECRET;
  process.env.OMEGA_INTEGRITY_TEST_SECRET = 'super-secret-value';
  try {
    const env = buildSandboxEnv(4321);
    assert.equal(env.PORT, '4321');
    // Windows exposes PATH as "Path" when spread from process.env.
    assert.ok(env.PATH || env.Path);
    assert.equal(env.OMEGA_INTEGRITY_TEST_SECRET, undefined);
    assert.equal(env.GEMINI_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.OMEGA_INTEGRITY_TEST_SECRET;
    else process.env.OMEGA_INTEGRITY_TEST_SECRET = previous;
  }
});
