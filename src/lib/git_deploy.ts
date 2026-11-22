import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { sanitizeBranchName, sanitizeCommitMessage, sanitizeGitRemoteUrl } from './export';
import type { GitDeployResult, GitDeployStep } from './types';

/**
 * Real Git release agent.
 *
 * Every command is passed to `execFile` as an argument vector — never through a
 * shell — and the child environment drops credentials and Git path overrides.
 * The remote URL is allow-listed before it can reach `git remote add`.
 *
 * Time complexity: O(C) where C is a fixed number of Git commands (≤ 10).
 * Space complexity: O(output) bounded by `MAX_OUTPUT_CHARS` per step.
 */

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 500;
const SENSITIVE_ENV_KEY =
  /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|SESSION|COOKIE|AUTH)/i;
const GIT_OVERRIDE_ENV_KEY =
  /^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_SSH_COMMAND|GIT_ASKPASS|GIT_CONFIG|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_|GIT_CONFIG_VALUE_)/i;

export interface GitDeployParams {
  repoDir: string;
  remoteUrl: string;
  branch?: string;
  commitMessage?: string;
  /** When true, all local steps run but `git push` is only previewed. */
  dryRun?: boolean;
  /** Allow a local bare repository as remote (tests / on-prem only). */
  allowLocalRemote?: boolean;
  timeoutMs?: number;
}

/**
 * Build a sanitized child environment: host secrets and Git path/config
 * overrides can never leak into, or redirect, a deployment process.
 */
export function buildDeployEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (SENSITIVE_ENV_KEY.test(key) || GIT_OVERRIDE_ENV_KEY.test(key)) delete env[key];
  }
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function preview(args: string[]): string {
  return ['git', ...args].join(' ');
}

/** Execute the full commit/push sequence against an already materialized bundle. */
export async function executeGitDeploy(params: GitDeployParams): Promise<GitDeployResult> {
  const remoteCheck = sanitizeGitRemoteUrl(params.remoteUrl, {
    allowLocal: params.allowLocalRemote === true,
  });
  if (!remoteCheck.valid) {
    throw new Error(remoteCheck.error || 'رابط مستودع Git غير صالح.');
  }

  const repoDir = path.resolve(params.repoDir);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    throw new Error('مجلد الحزمة المصدّرة غير موجود على القرص.');
  }

  const branch = sanitizeBranchName(params.branch || 'main');
  const message = sanitizeCommitMessage(
    params.commitMessage || '',
    path.basename(repoDir) || 'project',
  );
  const timeout = Math.max(2000, Math.min(120_000, params.timeoutMs ?? 30_000));
  const dryRun = params.dryRun === true;
  const env = buildDeployEnv();
  const steps: GitDeployStep[] = [];
  const commandPreview: string[] = [preview(['--version'])];
  let stepError: string | null = null;

  const run = async (args: string[], optional = false): Promise<string> => {
    const started = performance.now();
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: repoDir,
        env,
        timeout,
        maxBuffer: 1024 * 512,
      });
      const output = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim().slice(-MAX_OUTPUT_CHARS);
      steps.push({
        cmd: preview(args),
        ok: true,
        optional,
        output,
        durationMs: Number((performance.now() - started).toFixed(2)),
      });
      commandPreview.push(preview(args));
      return stdout.trim();
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; message?: string };
      const output = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`
        .trim()
        .slice(-MAX_OUTPUT_CHARS);
      if (error.code === 'ENOENT') {
        throw new Error('أمر git غير مثبت على هذا الجهاز.');
      }
      steps.push({
        cmd: preview(args),
        ok: false,
        optional,
        output,
        durationMs: Number((performance.now() - started).toFixed(2)),
      });
      commandPreview.push(preview(args));
      if (!optional && !stepError) stepError = output || 'فشل تنفيذ أمر Git.';
      return '';
    }
  };

  // Verify git is present before any repository mutation.
  try {
    await execFileAsync('git', ['--version'], { env, timeout: 5000, maxBuffer: 64 * 1024 });
  } catch {
    throw new Error('أمر git غير مثبت أو لا يمكن تنفيذه على هذا الجهاز.');
  }

  let inWorkTree = false;
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: repoDir,
      env,
      timeout: 5000,
    });
    inWorkTree = true;
  } catch {
    inWorkTree = false;
  }

  if (!inWorkTree) {
    try {
      await run(['init', '-b', branch], true);
    } catch {
      await run(['init'], true);
      await run(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], true);
    }
  } else {
    await run(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], true);
  }

  await run(['config', 'user.name', 'GENESIS-OMEGA']);
  await run(['config', 'user.email', 'release@genesis-omega.local']);
  await run(['add', '-A']);
  await run(['commit', '--allow-empty', '-m', message]);

  const commitHash = (await run(['rev-parse', 'HEAD'])) || null;

  await run(['remote', 'remove', 'origin'], true);
  await run(['remote', 'add', 'origin', remoteCheck.sanitized]);

  let pushed = false;
  if (dryRun) {
    commandPreview.push(`${preview(['push', '-u', 'origin', branch])}  # dry-run: not executed`);
  } else {
    await run(['push', '-u', 'origin', branch]);
    pushed = !stepError;
  }

  const committed = Boolean(commitHash) && !stepError;
  const success = !stepError && committed && (dryRun || pushed);
  return {
    success,
    dryRun,
    repoDir,
    remote: remoteCheck.sanitized,
    branch,
    commitHash,
    committed,
    pushed,
    steps,
    commandPreview,
    error: stepError || undefined,
    finishedAt: new Date().toISOString(),
  };
}
