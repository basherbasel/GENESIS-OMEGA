/**
 * Registry of four deterministic local agent profiles.
 *
 * Every profile pins numeric sampling parameters and a system contract, then
 * maps to an installed Ollama model from the curated catalog. No cloud client
 * is imported: inference always goes through local_synthesis -> llama-bridge.
 */

import { isLocalModelId } from '../local_models';

export type BrainRole = 'architect' | 'coder' | 'healer' | 'auditor';

export interface BrainProfile {
  role: BrainRole;
  labelAr: string;
  labelEn: string;
  temperature: number;
  numCtx: number;
  numPredict: number;
  repeatPenalty: number;
  systemContract: string;
  preferredModelIds: string[];
}

/** Tuned for a 16GB-RAM workstation: 4-8k context, conservative sampling. */
export const BRAIN_PROFILES: Record<BrainRole, BrainProfile> = {
  architect: {
    role: 'architect',
    labelAr: 'المعماري',
    labelEn: 'Architect',
    temperature: 0.25,
    numCtx: 8192,
    numPredict: 2048,
    repeatPenalty: 1.05,
    systemContract:
      'You are the architecture brain. Analyze requirements and existing symbols. Output a bounded architecture plan with explicit file responsibilities, contracts and risks. Never invent APIs that are not in the repository index. Return JSON only.',
    preferredModelIds: ['qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'qwen2.5-coder:1.5b'],
  },
  coder: {
    role: 'coder',
    labelAr: 'المبرمج',
    labelEn: 'Coder',
    temperature: 0.1,
    numCtx: 6144,
    numPredict: 3072,
    repeatPenalty: 1.08,
    systemContract:
      'You are the implementation brain. Emit complete, dependency-free, production-grade files with runnable tests. Respect the existing symbol index and never duplicate declarations. Return JSON only.',
    preferredModelIds: ['qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'qwen2.5-coder:1.5b'],
  },
  healer: {
    role: 'healer',
    labelAr: 'المُصلح',
    labelEn: 'Healer',
    temperature: 0.05,
    numCtx: 4096,
    numPredict: 1536,
    repeatPenalty: 1.1,
    systemContract:
      'You are the repair brain. Propose the smallest single-cause patch that fixes the quoted verifier evidence. If evidence is insufficient, return no patch. Never guess a passing test count. Return JSON only.',
    preferredModelIds: ['qwen2.5-coder:3b', 'qwen2.5-coder:1.5b', 'qwen2.5-coder:7b'],
  },
  auditor: {
    role: 'auditor',
    labelAr: 'المدقق',
    labelEn: 'Auditor',
    temperature: 0.15,
    numCtx: 8192,
    numPredict: 2048,
    repeatPenalty: 1.05,
    systemContract:
      'You are the security and quality auditor. Report only findings backed by file/line evidence or verifier output. Flag secrets, traversal, eval/exec and shell=True. Never claim formal verification. Return JSON only.',
    preferredModelIds: ['qwen2.5-coder:7b', 'qwen2.5-coder:3b'],
  },
};

export const BRAIN_ROLES = Object.keys(BRAIN_PROFILES) as BrainRole[];

export function isBrainRole(value: unknown): value is BrainRole {
  return typeof value === 'string' && (BRAIN_ROLES as string[]).includes(value);
}

/** Pick the first preferred model that is actually installed; never a cloud id. */
export function resolveBrainModel(role: BrainRole, installedModelIds: ReadonlySet<string>): string {
  const profile = BRAIN_PROFILES[role];
  const match = profile.preferredModelIds.find((id) => installedModelIds.has(id) && isLocalModelId(id));
  const fallback = profile.preferredModelIds.find((id) => isLocalModelId(id));
  return match || fallback || 'qwen2.5-coder:3b';
}

export function buildBrainSystemPrompt(role: BrainRole): string {
  const p = BRAIN_PROFILES[role];
  return [
    p.systemContract,
    `Deterministic parameters: temperature=${p.temperature}, num_ctx=${p.numCtx}, num_predict=${p.numPredict}, repeat_penalty=${p.repeatPenalty}.`,
  ].join('\n');
}

/** Sampling parameters passed to the guarded local bridge. */
export function brainInferenceOptions(role: BrainRole): {
  temperature: number;
  numCtx: number;
  numPredict: number;
  repeatPenalty: number;
} {
  const p = BRAIN_PROFILES[role];
  return {
    temperature: p.temperature,
    numCtx: p.numCtx,
    numPredict: p.numPredict,
    repeatPenalty: p.repeatPenalty,
  };
}
