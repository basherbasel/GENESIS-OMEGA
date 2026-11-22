/**
 * OS-level process containment for generated sandboxes.
 *
 * Windows: a detached PowerShell supervisor assigns the child process to a
 * Job Object with KILL_ON_JOB_CLOSE, so descendants cannot outlive the sandbox.
 * Linux/macOS: detection only — bwrap/sandbox-exec spawning is not implemented,
 * and callers fail closed rather than running without isolation.
 *
 * Failures are explicit `SANDBOX_UNAVAILABLE` errors; there is no silent path
 * that starts an unisolated process.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SandboxKind = 'windows-job-object' | 'bubblewrap' | 'sandbox-exec';

export interface SandboxDetection {
  kind: SandboxKind | null;
  detail: string;
}

export class SandboxUnavailableError extends Error {
  readonly code = 'SANDBOX_UNAVAILABLE' as const;

  constructor(detail: string) {
    super(`OS sandbox unavailable: ${detail}`);
    this.name = 'SandboxUnavailableError';
  }
}

function projectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found');
    dir = parent;
  }
}

function commandSucceeds(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
  return result.status === 0;
}

export function detectSandbox(): SandboxDetection {
  if (process.platform === 'win32') {
    const script = path.join(projectRoot(), 'scripts', 'windows_job_sandbox.ps1');
    // Only the script's presence is checked here; the real Job Object attach
    // is verified at runtime by attachWindowsJob, which fails closed.
    return fs.existsSync(script)
      ? { kind: 'windows-job-object', detail: 'Job Object supervisor script present (attach verified at runtime)' }
      : { kind: null, detail: 'PowerShell Job Object supervisor missing' };
  }
  if (process.platform === 'linux') {
    return commandSucceeds('bwrap', ['--version'])
      ? { kind: 'bubblewrap', detail: 'bwrap present (spawn wrapping not implemented)' }
      : { kind: null, detail: 'bwrap not found' };
  }
  if (process.platform === 'darwin') {
    return fs.existsSync('/usr/bin/sandbox-exec')
      ? { kind: 'sandbox-exec', detail: 'sandbox-exec present (spawn wrapping not implemented)' }
      : { kind: null, detail: 'sandbox-exec missing' };
  }
  return { kind: null, detail: `unsupported platform ${process.platform}` };
}

export function assertSandboxAvailable(): SandboxDetection {
  const detection = detectSandbox();
  if (!detection.kind) throw new SandboxUnavailableError(detection.detail);
  return detection;
}

/** Attach a running child to the Windows Job Object. Throws on any failure. */
export async function attachWindowsJob(pid: number): Promise<void> {
  const statusFile = path.join(os.tmpdir(), `omega-job-${pid}-${Date.now()}.status`);
  const script = path.join(projectRoot(), 'scripts', 'windows_job_sandbox.ps1');
  const supervisor = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-TargetPid',
      String(pid),
      '-StatusFile',
      statusFile,
    ],
    { detached: true, stdio: 'ignore' },
  );
  supervisor.unref();

  // PowerShell Add-Type compiles the P/Invoke shim on first use (~3s here).
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(statusFile)) {
      const status = fs.readFileSync(statusFile, 'utf-8').trim();
      fs.rmSync(statusFile, { force: true });
      if (status === 'ATTACHED') return;
      throw new SandboxUnavailableError(`Job Object attach failed: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  fs.rmSync(statusFile, { force: true });
  throw new SandboxUnavailableError('Job Object supervisor did not report within 12s');
}

/** Dispatch containment by platform; never returns silently on unsupported hosts. */
export async function attachProcessIsolation(pid: number): Promise<SandboxDetection> {
  const detection = assertSandboxAvailable();
  if (detection.kind === 'windows-job-object') {
    await attachWindowsJob(pid);
    return detection;
  }
  throw new SandboxUnavailableError(`${detection.detail}; wrapping not implemented`);
}
