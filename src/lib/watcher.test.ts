import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWatchedDirectory, resolveSafeWatchPath } from './watcher';

test('resolveSafeWatchPath rejects unsafe inputs and accepts a real temp directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-watch-'));
  try {
    assert.equal(resolveSafeWatchPath('', root).valid, false);
    assert.equal(resolveSafeWatchPath('C:\\Windows', root).valid, false);
    assert.equal(resolveSafeWatchPath('/etc', root).valid, false);
    const ok = resolveSafeWatchPath(root, root);
    assert.equal(ok.valid, true);
    assert.equal(ok.resolved, fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inspectWatchedDirectory lists only files whose SHA-256 actually changed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-watch-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'alpha', 'utf-8');
    const first = inspectWatchedDirectory(root, root);
    assert.equal(first.ok, true);
    assert.equal(first.inspection?.filesCount, 1);
    const firstHash = first.inspection?.treeHash || '';
    assert.ok(firstHash && firstHash !== 'empty');

    fs.writeFileSync(path.join(root, 'b.txt'), 'beta', 'utf-8');
    const second = inspectWatchedDirectory(root, root, firstHash, first.inspection?.fileHashes);
    assert.equal(second.ok, true);
    assert.equal(second.changed, true);
    assert.deepEqual(second.changedFiles, ['b.txt']);
    assert.equal(second.inspection?.filesCount, 2);

    const third = inspectWatchedDirectory(root, root, second.inspection?.treeHash, second.inspection?.fileHashes);
    assert.equal(third.changed, false);
    assert.deepEqual(third.changedFiles, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
