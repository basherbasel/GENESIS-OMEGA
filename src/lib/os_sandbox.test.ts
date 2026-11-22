import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSandboxAvailable,
  attachWindowsJob,
  describeSandboxStatus,
  detectSandbox,
  SandboxUnavailableError,
  spawnIsolated,
} from './os_sandbox';

test('supervisor status codes are translated into actionable diagnostics', () => {
  assert.match(describeSandboxStatus('CREATE_PROCESS_FAILED_BREAKAWAY_DENIED:5'), /Job الأب/);
  assert.match(describeSandboxStatus('ASSIGN_FAILED_ACCESS_DENIED:5'), /Job متداخلة/);
  assert.match(describeSandboxStatus('RESUME_THREAD_FAILED:5'), /استئناف/);
});

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

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('killing the supervisor terminates grandchildren inside the Job Object', { skip: process.platform !== 'win32' }, async () => {
  const marker = path.join(os.tmpdir(), `omega-grandchild-${Date.now()}.pid`);
  const script =
    "const cp=require('child_process'),fs=require('fs');" +
    "const g=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});" +
    `fs.writeFileSync(${JSON.stringify(marker)},String(g.pid));` +
    "console.log('SPAWNED');setInterval(()=>{},1000);";
  const isolated = await spawnIsolated(process.execPath, ['-e', script], process.cwd(), { ...process.env });
  try {
    let grandchildPid = 0;
    for (let i = 0; i < 60; i += 1) {
      if (fs.existsSync(marker)) {
        grandchildPid = Number(fs.readFileSync(marker, 'utf-8').trim());
        if (grandchildPid > 0) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(grandchildPid > 0, 'grandchild never reported its pid');
    assert.equal(pidAlive(grandchildPid), true, 'grandchild was not alive before kill');

    isolated.supervisor.kill('SIGKILL');
    let dead = false;
    for (let i = 0; i < 40; i += 1) {
      if (!pidAlive(grandchildPid)) {
        dead = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(dead, true, 'grandchild survived supervisor termination (job leak)');
  } finally {
    isolated.supervisor.kill('SIGKILL');
    fs.rmSync(marker, { force: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.rmSync(isolated.tempDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
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
