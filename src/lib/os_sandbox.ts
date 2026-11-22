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

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SandboxKind = 'windows-job-object' | 'bubblewrap' | 'sandbox-exec';

export interface SandboxDetection {
  kind: SandboxKind | null;
  detail: string;
}

/** Translate supervisor status codes into actionable Arabic diagnostics. */
export function describeSandboxStatus(status: string): string {
  if (status.startsWith('CREATE_PROCESS_FAILED_BREAKAWAY_DENIED:5')) {
    return 'الـ Job الأب لا يسمح CREATE_BREAKAWAY_FROM_JOB (ACCESS_DENIED 5) — بيئة CI/حاوية';
  }
  if (status.startsWith('ASSIGN_FAILED_ACCESS_DENIED:5')) {
    return 'سياسة Job متداخلة منعت إسناد العملية المعزولة (ACCESS_DENIED 5)';
  }
  if (status.startsWith('RESUME_THREAD_FAILED:')) {
    return 'فشل استئناف العملية بعد إسنادها للـ Job — أُوقفت حمايةً';
  }
  if (status.startsWith('CREATE_PROCESS_FAILED:')) {
    return `فشل إنشاء العملية المعزولة: ${status}`;
  }
  if (status.startsWith('ASSIGN_FAILED:')) {
    return `فشل إسناد العملية إلى Job Object: ${status}`;
  }
  if (status.startsWith('CREATE_JOB_FAILED:') || status.startsWith('SET_LIMIT_FAILED:')) {
    return `فشل إعداد Job Object: ${status}`;
  }
  return `حالة مشرف غير معروفة: ${status}`;
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
      throw new SandboxUnavailableError(`Job Object attach failed: ${describeSandboxStatus(status)}`);
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

export interface IsolatedProcess {
  /** PID reported by the supervisor after the Job Object assignment. */
  pid: number;
  /** Supervisor process; killing it closes the job and terminates descendants. */
  supervisor: ChildProcess;
  stdoutFile: string;
  stderrFile: string;
  tempDir: string;
}

/**
 * Spawn a process directly inside an isolated Job Object.
 *
 * The supervisor uses CREATE_BREAKAWAY_FROM_JOB so the child leaves the
 * parent's job before being assigned to ours — this avoids the ACCESS_DENIED
 * failure of attaching an already-inherited process. The inherited (filtered)
 * environment travels through the supervisor's env.
 */
export async function spawnIsolated(
  exe: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<IsolatedProcess> {
  assertSandboxAvailable();
  if (process.platform !== 'win32') {
    throw new SandboxUnavailableError('isolated spawning implemented only on Windows Job Objects');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-iso-'));
  const stdoutFile = path.join(tempDir, 'stdout.log');
  const stderrFile = path.join(tempDir, 'stderr.log');
  const statusFile = path.join(tempDir, 'status.txt');
  fs.writeFileSync(stdoutFile, '', 'utf-8');
  fs.writeFileSync(stderrFile, '', 'utf-8');

  const script = path.join(projectRoot(), 'scripts', 'windows_job_sandbox.ps1');
  const supervisor = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-Mode',
      'Launch',
      '-Exe',
      exe,
      '-ArgsPacked',
      args.join('\u001f'),
      '-WorkingDirectory',
      cwd,
      '-StdoutFile',
      stdoutFile,
      '-StderrFile',
      stderrFile,
      '-StatusFile',
      statusFile,
    ],
    { env, stdio: 'ignore' },
  );

  const deadline = Date.now() + 12_000;
  try {
    while (Date.now() < deadline) {
      if (fs.existsSync(statusFile)) {
        const status = fs.readFileSync(statusFile, 'utf-8').trim();
        if (!status.startsWith('ATTACHED|')) {
          throw new SandboxUnavailableError(`isolated spawn failed: ${describeSandboxStatus(status)}`);
        }
        const pid = Number(status.split('|')[1]);
        if (!Number.isFinite(pid) || pid <= 0) {
          throw new SandboxUnavailableError(`isolated spawn returned invalid pid: ${status}`);
        }
        return { pid, supervisor, stdoutFile, stderrFile, tempDir };
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new SandboxUnavailableError('isolated supervisor did not report within 12s');
  } catch (err) {
    supervisor.kill('SIGKILL');
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw err;
  }
}
