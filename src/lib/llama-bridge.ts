/**
 * Single-flight local inference bridge.
 *
 * Built on top of `ollama_client.ts`. One generation runs at a time per
 * process; a second caller waits, a third waiting caller is rejected with
 * QUEUE_FULL. Every failure is an explicit typed throw — there is no fallback
 * path in this module.
 *
 * Complexity: acquire/release O(1); waiting queue holds at most one caller.
 */

import { generateWithOllama } from './ollama_client';

export const LLAMA_DEFAULT_TIMEOUT_MS = 60_000;

export type LlamaBridgeErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'QUEUE_FULL'
  | 'PROCESS_FAILED';

export class LlamaBridgeError extends Error {
  readonly code: LlamaBridgeErrorCode;

  constructor(code: LlamaBridgeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlamaBridgeError';
    this.code = code;
  }
}

export interface LlamaGenerationParams {
  model: string;
  prompt: string;
  system?: string;
  jsonMode?: boolean;
  /** Default 60s. Overridable per call. */
  timeoutMs?: number;
  signal?: AbortSignal;
  numCtx?: number;
  numPredict?: number;
}

export interface LlamaGenerationResult {
  text: string;
  model: string;
  durationMs: number;
}

// ── Single-flight gate ───────────────────────────────────────────────────────
let active = false;
let queued: (() => void) | null = null;

/** Observable state for diagnostics/tests. */
export function bridgeState(): { active: boolean; waiting: number } {
  return { active, waiting: queued ? 1 : 0 };
}

function acquire(): Promise<() => void> {
  if (!active) {
    active = true;
    return Promise.resolve(release);
  }
  if (queued) {
    return Promise.reject(
      new LlamaBridgeError('QUEUE_FULL', 'A generation is running and another caller is already waiting.'),
    );
  }
  return new Promise<() => void>((resolve) => {
    queued = () => resolve(release);
  });
}

function release(): void {
  const next = queued;
  queued = null;
  if (next) {
    // Hand the slot directly to the waiter; `active` stays true so no second
    // generation can start during the handoff microtask.
    next();
    return;
  }
  active = false;
}

// ── Error classification (fail-closed) ───────────────────────────────────────
function classifyFailure(
  error: string | undefined,
  timedOut: boolean,
  externallyAborted: boolean,
  model: string,
): LlamaBridgeError {
  if (externallyAborted) {
    return new LlamaBridgeError('ABORTED', 'Generation aborted by caller signal.');
  }
  if (timedOut) {
    return new LlamaBridgeError('TIMEOUT', `Generation exceeded the configured timeout.`);
  }
  const detail = error || '';
  if (/404|not found|no such model|unknown model/i.test(detail)) {
    return new LlamaBridgeError('MODEL_NOT_FOUND', `Model "${model}" is not available locally: ${detail}`);
  }
  return new LlamaBridgeError('PROCESS_FAILED', `Local inference failed: ${detail || 'unknown error'}`);
}

/** Run one local generation. Throws on every failure; never returns a fallback. */
export async function generate(params: LlamaGenerationParams): Promise<LlamaGenerationResult> {
  const timeoutMs = params.timeoutMs ?? LLAMA_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new LlamaBridgeError('PROCESS_FAILED', 'timeoutMs must be a positive finite number.');
  }
  if (params.signal?.aborted) {
    throw new LlamaBridgeError('ABORTED', 'Caller signal was already aborted.');
  }

  const release = await acquire();
  if (params.signal?.aborted) {
    release();
    throw new LlamaBridgeError('ABORTED', 'Caller signal was aborted while waiting for the bridge.');
  }

  const timeoutController = new AbortController();
  let timedOut = false;
  let externallyAborted = false;

  const onExternalAbort = () => {
    externallyAborted = true;
    timeoutController.abort();
  };
  params.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  timer.unref?.();

  const startedAt = Date.now();
  try {
    const result = await generateWithOllama({
      model: params.model,
      prompt: params.prompt,
      system: params.system,
      jsonMode: params.jsonMode,
      numCtx: params.numCtx,
      numPredict: params.numPredict,
      signal: timeoutController.signal,
      // The bridge owns the deadline; give the underlying client a slightly
      // wider window so its abort always trails ours and TIMEOUT is attributable.
      timeoutMs: timeoutMs + 5000,
    });

    if (!result.ok) {
      throw classifyFailure(result.error, timedOut, externallyAborted, params.model);
    }
    return { text: result.text, model: result.model, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', onExternalAbort);
    release();
  }
}
