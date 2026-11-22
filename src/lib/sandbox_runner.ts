import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { spawnIsolated } from './os_sandbox';
import type { ProjectRecord } from './types';
import { materializeWorkspaceFiles } from './verifier';

interface RunningSandbox {
  projectId: number;
  port: number;
  baseUrl: string;
  cmdLabel: string;
  startedAt: string;
  logs: string[];
  supervisor: ChildProcess;
  isolatedPid: number;
  stdoutFile: string;
  stderrFile: string;
  tempDir: string;
  offsets: { out: number; err: number };
  pump?: NodeJS.Timeout;
}

const activeSandboxes = new Map<number, RunningSandbox>();

const SENSITIVE_ENV_KEY = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|SESSION|COOKIE|AUTH)/i;

/** Build a minimal environment for generated sandbox code. */
export function buildSandboxEnv(port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
  for (const key of Object.keys(env)) {
    if (SENSITIVE_ENV_KEY.test(key)) delete env[key];
  }
  return env;
}

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => {
        if (port > 0) resolve(port);
        else reject(new Error('Failed to bind ephemeral localhost port'));
      });
    });
  });
}

function resolveRunnableCommand(
  workspaceDir: string,
  project: ProjectRecord,
): { cmd: string; args: string[]; label: string } | null {
  if (project.ecosystemKey === 'nodejs' && project.files['index.js']) {
    return { cmd: 'node', args: ['index.js'], label: 'node index.js' };
  }
  if (project.ecosystemKey === 'typescript' && project.files['src/index.ts']) {
    const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
    if (fs.existsSync(tsxBin)) {
      return { cmd: tsxBin, args: ['src/index.ts'], label: 'tsx src/index.ts' };
    }
  }
  if (project.files['main.py']) {
    return { cmd: 'python3', args: ['-u', 'main.py'], label: 'python3 -u main.py' };
  }
  if (project.files['fullstack_server.py']) {
    return { cmd: 'python3', args: ['-u', 'fullstack_server.py'], label: 'python3 -u fullstack_server.py' };
  }
  if (fs.existsSync(path.join(workspaceDir, 'main.py'))) {
    return { cmd: 'python3', args: ['-u', 'main.py'], label: 'python3 -u main.py' };
  }
  return null;
}

async function waitForHealth(baseUrl: string, timeoutMs = 3500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(450) });
      if (resp.ok) return true;
    } catch {
      // keep polling until process binds
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

export async function startSandboxProcess(
  workspaceDir: string,
  project: ProjectRecord,
): Promise<{
  running: boolean;
  port: number | null;
  baseUrl: string | null;
  liveProcess: boolean;
  logs: string;
}> {
  await stopSandboxProcess(project.id);

  const resolvedRoot = path.resolve(workspaceDir);
  materializeWorkspaceFiles(resolvedRoot, project.files);

  const spec = resolveRunnableCommand(resolvedRoot, project);
  if (!spec) {
    return {
      running: true,
      port: null,
      baseUrl: null,
      liveProcess: false,
      logs: `[Sandbox Ready] البيئة المعزولة متاحة عبر موجه الخدمات على /sandbox/${project.id}/health`,
    };
  }

  const port = await pickFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  // No unisolated path: spawnIsolated fails closed with SANDBOX_UNAVAILABLE.
  const isolated = await spawnIsolated(spec.cmd, spec.args, resolvedRoot, buildSandboxEnv(port));

  const entry: RunningSandbox = {
    projectId: project.id,
    port,
    baseUrl,
    cmdLabel: spec.label,
    startedAt: new Date().toISOString(),
    logs: [
      `[Live OS Sandbox · Job Object pid ${isolated.pid}] بدء التشغيل المعزول: ${spec.label} على ${baseUrl}`,
    ],
    supervisor: isolated.supervisor,
    isolatedPid: isolated.pid,
    stdoutFile: isolated.stdoutFile,
    stderrFile: isolated.stderrFile,
    tempDir: isolated.tempDir,
    offsets: { out: 0, err: 0 },
  };

  const pushLine = (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      entry.logs.push(trimmed);
      if (entry.logs.length > 40) entry.logs.shift();
    }
  };

  entry.pump = setInterval(() => {
    const targets: Array<[string, 'out' | 'err']> = [
      [entry.stdoutFile, 'out'],
      [entry.stderrFile, 'err'],
    ];
    for (const [file, key] of targets) {
      try {
        const stat = fs.statSync(file);
        if (stat.size <= entry.offsets[key]) continue;
        const buffer = fs.readFileSync(file);
        pushLine(buffer.subarray(entry.offsets[key], stat.size).toString('utf-8'));
        entry.offsets[key] = stat.size;
      } catch {
        // log file may not exist yet
      }
    }
  }, 200);
  entry.pump.unref?.();

  isolated.supervisor.on('exit', () => {
    const cur = activeSandboxes.get(project.id);
    if (cur && cur.supervisor === isolated.supervisor) {
      activeSandboxes.delete(project.id);
    }
  });

  activeSandboxes.set(project.id, entry);

  const healthy = await waitForHealth(baseUrl, 3500);
  if (!healthy) {
    await stopSandboxProcess(project.id);
    return {
      running: true,
      port: null,
      baseUrl: null,
      liveProcess: false,
      logs: `[Sandbox Fallback] تعذر استجابة العملية المعزولة خلال المهلة:\n${entry.logs.join('\n')}`,
    };
  }

  entry.logs.push(`[Health OK] استجاب الخادم المعزول على ${baseUrl}/health بنجاح.`);
  return {
    running: true,
    port,
    baseUrl,
    liveProcess: true,
    logs: entry.logs.join('\n'),
  };
}

export async function stopSandboxProcess(projectId: number): Promise<void> {
  const existing = activeSandboxes.get(projectId);
  if (!existing) return;
  activeSandboxes.delete(projectId);
  clearInterval(existing.pump);
  try {
    // Closing the supervisor closes the Job Object; KILL_ON_JOB_CLOSE
    // terminates the server child and all of its descendants.
    existing.supervisor.kill('SIGKILL');
  } catch {
    // process may have exited already
  }
  await new Promise((r) => setTimeout(r, 150));
  fs.rmSync(existing.tempDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

export function getLiveSandboxInfo(projectId: number): {
  port: number;
  baseUrl: string;
  cmdLabel: string;
  logs: string;
} | null {
  const entry = activeSandboxes.get(projectId);
  if (!entry || entry.supervisor.killed || entry.supervisor.exitCode !== null) {
    if (entry) activeSandboxes.delete(projectId);
    return null;
  }
  return {
    port: entry.port,
    baseUrl: entry.baseUrl,
    cmdLabel: entry.cmdLabel,
    logs: entry.logs.join('\n'),
  };
}

export async function probeLiveSandbox(
  projectId: number,
  endpointPath: string,
  method: string = 'GET',
  payload?: unknown,
): Promise<{
  status: number;
  latencyMs: number;
  body: unknown;
  endpoint: string;
  liveProcess: boolean;
} | null> {
  const info = getLiveSandboxInfo(projectId);
  if (!info) return null;

  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const targetUrl = `${info.baseUrl}${cleanPath}`;
  const t0 = performance.now();
  const upperMethod = method.toUpperCase();

  const resp = await fetch(targetUrl, {
    method: upperMethod,
    headers: upperMethod === 'POST' || upperMethod === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
    body:
      (upperMethod === 'POST' || upperMethod === 'PUT') && payload !== undefined
        ? JSON.stringify(payload)
        : undefined,
    signal: AbortSignal.timeout(4000),
  });

  const text = await resp.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text if non-JSON
  }

  return {
    status: resp.status,
    latencyMs: Number((performance.now() - t0).toFixed(2)),
    body,
    endpoint: cleanPath,
    liveProcess: true,
  };
}

export function stopAllSandboxes(): void {
  for (const id of Array.from(activeSandboxes.keys())) {
    void stopSandboxProcess(id);
  }
}
