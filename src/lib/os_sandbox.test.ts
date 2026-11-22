import { spawn } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSandboxAvailable,
  attachWindowsJob,
  detectSandbox,
  SandboxUnavailableError,
  spawnIsolated,
} from './os_sandbox';

test('detection reports the supervisor but never claims a working containment blindly', () => {
  const detection = detectSandbox();
  if (process.platform === 'win32') {
    assert.equal(detection.kind, 'windows-job-object');
    assert.doesNotThrow(() => assertSandboxAvailable());
  } else {
    assert.equal(detection.kind, null);
    assert.throws(
      () => assertSandboxAvailable(),
      (err: unknown) => err instanceof SandboxUnavailableError && err.code === 'SANDBOX_UNAVAILABLE',
    );
  }
});

test('a live process is either attached or rejected with SANDBOX_UNAVAILABLE — never silently unisolated', { skip: process.platform !== 'win32' }, async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'ignore' });
  try {
    const outcome = await attachWindowsJob(child.pid || 0).then(
      () => 'attached',
      (err: unknown) => (err instanceof SandboxUnavailableError ? err.code : 'other-failure'),
    );
    assert.ok(outcome === 'attached' || outcome === 'SANDBOX_UNAVAILABLE', `unexpected outcome ${outcome}`);
  } finally {
    child.kill('SIGKILL');
  }
});

test('a nonexistent pid fails closed with SANDBOX_UNAVAILABLE', { skip: process.platform !== 'win32' }, async () => {
  await assert.rejects(
    attachWindowsJob(2_000_000_000),
    (err: unknown) => err instanceof SandboxUnavailableError && err.code === 'SANDBOX_UNAVAILABLE',
  );
});

test('spawnIsolated launches a real child inside a Job Object and captures its output', { skip: process.platform !== 'win32' }, async () => {
  const isolated = await spawnIsolated(
    process.execPath,
    ['-e', "console.log('isolated-ok'); setTimeout(() => {}, 10000)"],
    process.cwd(),
    { ...process.env },
  );
  try {
    assert.ok(isolated.pid > 0);
    let output = '';
    for (let i = 0; i < 40; i += 1) {
      if (fs.existsSync(isolated.stdoutFile)) {
        output = fs.readFileSync(isolated.stdoutFile, 'utf-8');
        if (output.includes('isolated-ok')) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.match(output, /isolated-ok/);
  } finally {
    isolated.supervisor.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.rmSync(isolated.tempDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
});
