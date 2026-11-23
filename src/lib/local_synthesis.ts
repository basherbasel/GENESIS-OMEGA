/**
 * Local code synthesis through the guarded llama-bridge.
 *
 * Uses the single-flight bridge (mutex, timeout, AbortSignal, fail-closed
 * error codes) instead of calling ollama_client directly. No cloud model is
 * imported or called from this module.
 */

import { generate, LlamaBridgeError, type LlamaGenerationResult } from './llama-bridge';
import { isSafeRelativePath } from './security';
import type { EcosystemMeta, GovernorStats, ModelRoutingConfig, VaultEntry } from './types';

export interface LocalSynthesisParams {
  title: string;
  prompt: string;
  eco: EcosystemMeta;
  routing: ModelRoutingConfig;
  vault: VaultEntry[];
  governor?: GovernorStats;
  /** Deterministic brain-profile sampling bounds forwarded to the bridge. */
  numCtx?: number;
  numPredict?: number;
  /** Injectable for tests; defaults to the real guarded bridge. */
  generateFn?: typeof generate;
}

export interface LocalSynthesisOutput {
  engine: 'ollama-bridge';
  usedLocal: boolean;
  modelUsed: string;
  generatedFiles: Record<string, string>;
  architectureSummary?: string;
  error?: string;
  errorCode?: string;
}

const SYSTEM =
  'You are the GENESIS-OMEGA local code synthesizer. Produce clean, secure, dependency-free standard library code and runnable unit tests. Never emit hardcoded secrets, eval, exec, os.system, or shell=True. Return JSON only.';

function buildPrompt(params: LocalSynthesisParams): string {
  const vault = params.vault
    .slice(0, 4)
    .map((v) => `- ${v.domain}: ${v.verifiedWisdom}`)
    .join('\n');
  return [
    `Project Title: ${params.title}`,
    `Ecosystem: ${params.eco.displayName} (entry: ${params.eco.entryFile})`,
    `Requirements: ${params.prompt}`,
    `Knowledge Vault Rules:\n${vault || 'Use SQLite WAL, parameterized queries, zero eval/exec, /health endpoint'}`,
    'Generate production-ready core module(s) and unit tests using standard library only.',
    'Return STRICT JSON: {"architectureSummary": string, "files": [{"path": string, "content": string}]}',
  ].join('\n\n');
}

function collectFiles(raw: unknown): Record<string, string> {
  const files: Record<string, string> = {};
  if (!Array.isArray(raw)) return files;
  for (const item of raw.slice(0, 40)) {
    const entry = item as { path?: unknown; content?: unknown };
    if (typeof entry?.path !== 'string' || typeof entry?.content !== 'string') continue;
    const safe = isSafeRelativePath(entry.path);
    const content = entry.content.trimEnd();
    if (safe && content.length > 0 && content.length <= 120_000) {
      files[safe] = content + '\n';
    }
  }
  return files;
}

export interface LocalTextSynthesisParams {
  prompt: string;
  /** Local model id resolved by the caller from a brain profile. */
  model: string;
  system?: string;
  /** Deterministic brain-profile sampling bounds forwarded to the bridge. */
  numCtx?: number;
  numPredict?: number;
  /** Forwarded to the bridge so callers can cancel a long generation. */
  signal?: AbortSignal;
  /** Injectable for tests; defaults to the real guarded bridge. */
  generateFn?: typeof generate;
}

export interface LocalTextSynthesisOutput {
  engine: 'ollama-bridge';
  modelUsed: string;
  /** Raw model text; empty when `error` is set. */
  text: string;
  error?: string;
  errorCode?: string;
}

/**
 * Raw-text counterpart of `synthesizeWithBridge` for contracts that are not
 * file maps (SEARCH/REPLACE patch batches). Identical fail-closed rules:
 * explicit error code, 60s timeout, AbortSignal, zero cloud fallback.
 */
export async function synthesizeTextWithBridge(
  params: LocalTextSynthesisParams,
): Promise<LocalTextSynthesisOutput> {
  const runner = params.generateFn || generate;
  try {
    const result = await runner({
      model: params.model,
      system: params.system || SYSTEM,
      prompt: params.prompt,
      jsonMode: true,
      numCtx: params.numCtx,
      numPredict: params.numPredict,
      timeoutMs: 60_000,
      signal: params.signal,
    });
    return { engine: 'ollama-bridge', modelUsed: params.model, text: result.text };
  } catch (err) {
    // Fail closed: never fall back to a cloud model here.
    const code = err instanceof LlamaBridgeError ? err.code : 'PROCESS_FAILED';
    return {
      engine: 'ollama-bridge',
      modelUsed: params.model,
      text: '',
      error: err instanceof Error ? err.message : String(err),
      errorCode: code,
    };
  }
}

export async function synthesizeWithBridge(params: LocalSynthesisParams): Promise<LocalSynthesisOutput> {
  const model = params.routing.builder_alpha;
  const runner = params.generateFn || generate;
  let result: LlamaGenerationResult;
  try {
    result = await runner({
      model,
      system: SYSTEM,
      prompt: buildPrompt(params),
      jsonMode: true,
      numCtx: params.numCtx,
      numPredict: params.numPredict,
      timeoutMs: 60_000,
    });
  } catch (err) {
    const code = err instanceof LlamaBridgeError ? err.code : 'PROCESS_FAILED';
    // Fail closed: never fall back to a cloud model here.
    return {
      engine: 'ollama-bridge',
      usedLocal: false,
      modelUsed: model,
      generatedFiles: {},
      error: err instanceof Error ? err.message : String(err),
      errorCode: code,
    };
  }

  // `generate` throws on every failure (fail-closed), so a returned result is
  // always a completed generation with text to parse.
  try {
    const parsed = JSON.parse(result.text) as { architectureSummary?: string; files?: unknown };
    const generatedFiles = collectFiles(parsed.files);
    return {
      engine: 'ollama-bridge',
      usedLocal: Object.keys(generatedFiles).length > 0,
      modelUsed: model,
      generatedFiles,
      architectureSummary: parsed.architectureSummary,
    };
  } catch (err) {
    return {
      engine: 'ollama-bridge',
      usedLocal: false,
      modelUsed: model,
      generatedFiles: {},
      error: err instanceof Error ? err.message : 'invalid local model JSON',
      errorCode: 'PROCESS_FAILED',
    };
  }
}
