/**
 * Self-healing stagnation breaker and OS process/workspace watchdog (v4).
 *
 * Uses real process-tree termination and real filesystem sweeps with strict
 * path prefixes; no placeholder cleanup or simulated process state.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { sanitizeChildEnv } from '../voice/voice_process';

const execFileAsync = promisify(execFile);

export const HEAL_STAGNATION_DETECTED = 'HEAL_STAGNATION_DETECTED';

export interface CycleObservation {
  signature: string;
  repeats: number;
  halt: boolean;
}

/** Deterministic signature of a failing compiler/test outcome. */
export function errorSignatureOf(stderr: string, failingFiles: string[]): string {
  const normalized = (stderr || '')
    .replace(/0x[0-9a-f]+/gi, '0xADDR')
    .replace(/\d+(?:\.\d+)?\s*ms/g, 'Nms')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8_000);
  return crypto
    .createHash('sha256')
    .update(`${normalized}\u0000${[...failingFiles].sort().join(',')}`, 'utf8')
    .digest('hex');
}

export class HealCycleBreaker {
  private lastSignature = '';
  private repeats = 0;

  observe(stderr: string, failingFiles: string[]): CycleObservation {
    const signature = errorSignatureOf(stderr, failingFiles);
    this.repeats = signature === this.lastSignature ? this.repeats + 1 : 1;
    this.lastSignature = signature;
    return {
      signature,
      repeats: this.repeats,
      halt: this.repeats >= 2,
    };
  }

  reset(): void {
    this.lastSignature = '';
    this.repeats = 0;
  }
}

/** Terminates a process and all of its OS children with a sanitized environment. */
export async function killProcessTree(pid: number): Promise<{ killed: boolean; detail: string }> {
  if (!Number.isInteger(pid) || pid <= 0) return { killed: false, detail: 'invalid pid' };
  const env = sanitizeChildEnv(process.env);
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { env, timeout: 15_000, windowsHide: true });
      return { killed: true, detail: `taskkill /PID ${pid} /T /F` };
    }
    try {
      process.kill(-pid, 'SIGKILL');
      return { killed: true, detail: `kill -${pid} SIGKILL` };
    } catch {
      process.kill(pid, 'SIGKILL');
      return { killed: true, detail: `kill ${pid} SIGKILL` };
    }
  } catch (err) {
    return { killed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export interface WorkspaceSweepResult {
  removed: string[];
  kept: number;
  errors: string[];
}

const SWEEP_PREFIXES = ['heal_', 'work_order_', 'omega-repo-', 'omega-stt-', 'omega-heal-'];

/** Removes only old, clearly-owned temporary workspaces; active jobs are kept. */
export function sweepStaleWorkspaces(
  roots: string[],
  options: { maxAgeMs?: number; now?: number; active?: ReadonlySet<string> } = {},
): WorkspaceSweepResult {
  const maxAge = Math.max(60_000, options.maxAgeMs ?? 60 * 60 * 1000);
  const now = options.now ?? Date.now();
  const active = options.active || new Set<string>();
  const result: WorkspaceSweepResult = { removed: [], kept: 0, errors: [] };

  for (const rawRoot of roots) {
    const root = path.resolve(rawRoot);
    let entries: fs.Dirent[];
    try {
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (err) {
      result.errors.push(`${root}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !SWEEP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
      const full = path.join(root, entry.name);
      if (active.has(full) || active.has(entry.name)) {
        result.kept += 1;
        continue;
      }
      try {
        const resolved = fs.realpathSync(full);
        if (path.relative(root, resolved).startsWith('..')) {
          result.errors.push(`${full}: symlink escape rejected`);
          continue;
        }
        const stat = fs.statSync(resolved);
        if (!stat.isDirectory() || now - stat.mtimeMs < maxAge) {
          result.kept += 1;
          continue;
        }
        fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
        result.removed.push(full);
      } catch (err) {
        result.errors.push(`${full}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return result;
}

/** Default roots used by the server at startup. */
export function defaultSweepRoots(directory: string): string[] {
  return [
    path.join(directory, 'workspaces'),
    path.join(os.tmpdir()),
    path.join(directory, 'voice_cache'),
  ];
}
