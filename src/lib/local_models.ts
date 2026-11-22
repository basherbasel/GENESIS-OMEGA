import type { AgentRole, GovernorStats } from './types';
import type { ModelOption } from './routing';

/**
 * Curated catalog of lightweight / quantized coding models for Ollama.
 *
 * Time/space: all lookups are O(1) via a precomputed Set; routing selection is
 * O(n) over a small (≈30) static catalog. No network calls in this module.
 *
 * `minRamGb` is a conservative floor for the quantized variant named in
 * `quant` — not the FP16 footprint. `heavy: true` marks models that are
 * installed locally but not recommended for constrained machines.
 */
export type LocalTier = 'nano' | 'fast' | 'balanced' | 'deep';

export interface LocalCodingModel {
  /** Ollama tag, e.g. `qwen2.5-coder:3b` or a local custom tag. */
  id: string;
  label: string;
  family: string;
  paramsB: number;
  quant: string;
  minRamGb: number;
  contextK: number;
  tier: LocalTier;
  heavy?: boolean;
  strengths: string[];
  recommendedRoles: AgentRole[];
}

const ALL: AgentRole[] = [
  'architect',
  'strategist',
  'builder_alpha',
  'builder_beta',
  'red_team',
  'synthesizer_healer',
];
const CODE: AgentRole[] = ['builder_alpha', 'builder_beta', 'synthesizer_healer'];
const REASON: AgentRole[] = ['architect', 'strategist', 'red_team', 'synthesizer_healer'];

export const LOCAL_CODING_MODELS: LocalCodingModel[] = [
  // ── Nano / ultra-light (< 2B) ──────────────────────────────────────────────
  { id: 'qwen2.5-coder:0.5b', label: 'Qwen2.5 Coder 0.5B', family: 'qwen', paramsB: 0.5, quant: 'Q4_K_M', minRamGb: 0.6, contextK: 32, tier: 'nano', strengths: ['code', 'ultra-light', 'arabic'], recommendedRoles: CODE },
  { id: 'qwen2.5-coder:1.5b', label: 'Qwen2.5 Coder 1.5B', family: 'qwen', paramsB: 1.5, quant: 'Q4_K_M', minRamGb: 1.2, contextK: 32, tier: 'nano', strengths: ['code', 'light', 'arabic'], recommendedRoles: CODE },
  { id: 'TinyLlama:1.1b', label: 'TinyLlama 1.1B', family: 'llama', paramsB: 1.1, quant: 'Q4_K_M', minRamGb: 1.0, contextK: 4, tier: 'nano', strengths: ['tiny', 'general'], recommendedRoles: ['builder_beta'] },
  { id: 'smollm2:1.7b', label: 'SmolLM2 1.7B', family: 'smollm', paramsB: 1.7, quant: 'Q4_K_M', minRamGb: 1.5, contextK: 8, tier: 'nano', strengths: ['tiny', 'instruction'], recommendedRoles: ['builder_beta'] },
  { id: 'gemma3:1b', label: 'Gemma 3 1B', family: 'gemma', paramsB: 1.0, quant: 'Q4_K_M', minRamGb: 1.2, contextK: 8, tier: 'nano', strengths: ['tiny', 'multilingual'], recommendedRoles: ['builder_beta'] },
  { id: 'codegemma:2b', label: 'CodeGemma 2B', family: 'gemma', paramsB: 2.0, quant: 'Q4_K_M', minRamGb: 1.8, contextK: 8, tier: 'nano', strengths: ['code', 'fill-in-middle'], recommendedRoles: CODE },
  { id: 'deepseek-r1:1.5b', label: 'DeepSeek R1 1.5B (distilled)', family: 'deepseek', paramsB: 1.5, quant: 'Q4_K_M', minRamGb: 1.6, contextK: 32, tier: 'nano', strengths: ['reasoning', 'audit'], recommendedRoles: REASON },

  // ── Fast / economical (3–4B) ───────────────────────────────────────────────
  { id: 'qwen2.5-coder:3b', label: 'Qwen2.5 Coder 3B', family: 'qwen', paramsB: 3.0, quant: 'Q4_K_M', minRamGb: 2.2, contextK: 32, tier: 'fast', strengths: ['code', 'balanced', 'arabic'], recommendedRoles: ALL },
  { id: 'starcoder2:3b', label: 'StarCoder2 3B', family: 'starcoder', paramsB: 3.0, quant: 'Q4_K_M', minRamGb: 2.2, contextK: 4, tier: 'fast', strengths: ['code', 'multi-language'], recommendedRoles: CODE },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', family: 'llama', paramsB: 3.0, quant: 'Q4_K_M', minRamGb: 2.2, contextK: 8, tier: 'fast', strengths: ['general', 'instruction'], recommendedRoles: ['architect', 'builder_beta'] },
  { id: 'phi3:3.8b', label: 'Phi-3 Mini 3.8B', family: 'phi', paramsB: 3.8, quant: 'Q4_K_M', minRamGb: 2.6, contextK: 4, tier: 'fast', strengths: ['reasoning', 'code'], recommendedRoles: REASON },
  { id: 'phi4-mini:3.8b', label: 'Phi-4 Mini 3.8B', family: 'phi', paramsB: 3.8, quant: 'Q4_K_M', minRamGb: 2.8, contextK: 16, tier: 'fast', strengths: ['reasoning', 'code', 'math'], recommendedRoles: REASON },
  { id: 'gemma3:4b', label: 'Gemma 3 4B', family: 'gemma', paramsB: 4.0, quant: 'Q4_K_M', minRamGb: 3.3, contextK: 8, tier: 'fast', strengths: ['multilingual', 'code'], recommendedRoles: ALL },

  // ── Balanced / quantized 7–8B ──────────────────────────────────────────────
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5 Coder 7B', family: 'qwen', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 32, tier: 'balanced', strengths: ['code', 'strong', 'arabic'], recommendedRoles: ALL },
  { id: 'qwen-coder-8k:latest', label: 'Qwen Coder 7B · 8K (محلي)', family: 'qwen', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 8, tier: 'balanced', strengths: ['code', 'custom-tag'], recommendedRoles: CODE },
  { id: 'qwen-coder-16k:latest', label: 'Qwen Coder 7B · 16K (محلي)', family: 'qwen', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 16, tier: 'balanced', strengths: ['code', 'long-context'], recommendedRoles: CODE },
  { id: 'qwen25-coder-7b-q2kl:latest', label: 'Qwen2.5 Coder 7B Q2_K_L', family: 'qwen', paramsB: 7.0, quant: 'Q2_K_L', minRamGb: 3.5, contextK: 32, tier: 'balanced', strengths: ['code', 'extra-quantized'], recommendedRoles: CODE },
  { id: 'qwen2.5-coder-7b-instruct-q2_k_l:latest', label: 'Qwen2.5 Coder 7B Instruct Q2_K_L', family: 'qwen', paramsB: 7.0, quant: 'Q2_K_L', minRamGb: 3.5, contextK: 32, tier: 'balanced', strengths: ['code', 'instruct', 'extra-quantized'], recommendedRoles: ALL },
  { id: 'ase-qwen25-coder:latest', label: 'ASE Qwen2.5 Coder (محلي)', family: 'qwen', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 3.5, contextK: 16, tier: 'balanced', strengths: ['code', 'custom-tag'], recommendedRoles: CODE },
  { id: 'starcoder2:7b', label: 'StarCoder2 7B', family: 'starcoder', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 4, tier: 'balanced', strengths: ['code', 'multi-language'], recommendedRoles: CODE },
  { id: 'codegemma:7b', label: 'CodeGemma 7B', family: 'gemma', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 5.0, contextK: 8, tier: 'balanced', strengths: ['code', 'fill-in-middle'], recommendedRoles: CODE },
  { id: 'codellama:7b', label: 'CodeLlama 7B', family: 'llama', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 4, tier: 'balanced', strengths: ['code', 'legacy'], recommendedRoles: CODE },
  { id: 'deepseek-coder:6.7b', label: 'DeepSeek Coder 6.7B', family: 'deepseek', paramsB: 6.7, quant: 'Q4_K_M', minRamGb: 4.0, contextK: 16, tier: 'balanced', strengths: ['code', 'reasoning'], recommendedRoles: CODE },
  { id: 'mistral:7b', label: 'Mistral 7B', family: 'mistral', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.4, contextK: 8, tier: 'balanced', strengths: ['general', 'fast'], recommendedRoles: ['architect', 'builder_beta'] },

  // ── Deep reasoning / locally installed heavier variants ───────────────────
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B (distilled)', family: 'deepseek', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 4.7, contextK: 32, tier: 'deep', strengths: ['reasoning', 'audit'], recommendedRoles: REASON },
  { id: 'ase-deepseek-r1:latest', label: 'ASE DeepSeek R1 (محلي)', family: 'deepseek', paramsB: 7.0, quant: 'Q4_K_M', minRamGb: 2.6, contextK: 32, tier: 'deep', strengths: ['reasoning', 'custom-tag'], recommendedRoles: REASON },
  { id: 'r1-0528-qwen3-8b-udiq2xxs:latest', label: 'R1 Qwen3 8B UDIQ2 (محلي)', family: 'qwen', paramsB: 8.0, quant: 'IQ2_XS', minRamGb: 2.6, contextK: 32, tier: 'deep', strengths: ['reasoning', 'extra-quantized'], recommendedRoles: REASON },
  { id: 'hermes3-8b-q4km:latest', label: 'Hermes 3 8B Q4_K_M (محلي)', family: 'hermes', paramsB: 8.0, quant: 'Q4_K_M', minRamGb: 4.9, contextK: 16, tier: 'balanced', strengths: ['instruction', 'code'], recommendedRoles: ALL },
  { id: 'ase-hermes3:latest', label: 'ASE Hermes 3 (محلي)', family: 'hermes', paramsB: 8.0, quant: 'Q4_K_M', minRamGb: 4.9, contextK: 16, tier: 'balanced', strengths: ['instruction', 'custom-tag'], recommendedRoles: ALL },
  { id: 'deepseek-coder-v2:16b', label: 'DeepSeek Coder V2 Lite 16B (MoE)', family: 'deepseek', paramsB: 16.0, quant: 'Q4_K_M', minRamGb: 10.0, contextK: 32, tier: 'deep', heavy: true, strengths: ['code', 'long-context', 'MoE'], recommendedRoles: REASON },
  // Installed on this machine but heavy — listed for completeness, never auto-selected.
  { id: 'deepseek:latest', label: 'DeepSeek (محلي · ثقيل)', family: 'deepseek', paramsB: 32.0, quant: 'Q4_K_M', minRamGb: 11.0, contextK: 16, tier: 'deep', heavy: true, strengths: ['custom-tag', 'heavy'], recommendedRoles: REASON },
  { id: 'qwen:latest', label: 'Qwen (محلي · ثقيل)', family: 'qwen', paramsB: 32.0, quant: 'Q4_K_M', minRamGb: 11.0, contextK: 16, tier: 'deep', heavy: true, strengths: ['custom-tag', 'heavy'], recommendedRoles: REASON },
  { id: 'hermes:latest', label: 'Hermes (محلي · ثقيل)', family: 'hermes', paramsB: 32.0, quant: 'Q4_K_M', minRamGb: 11.0, contextK: 16, tier: 'deep', heavy: true, strengths: ['custom-tag', 'heavy'], recommendedRoles: REASON },
  { id: 'qwen-coder-local:latest', label: 'Qwen Coder Local (محلي · ثقيل)', family: 'qwen', paramsB: 32.0, quant: 'Q4_K_M', minRamGb: 11.0, contextK: 16, tier: 'deep', heavy: true, strengths: ['custom-tag', 'heavy'], recommendedRoles: CODE },
];

const LOCAL_IDS = new Set(LOCAL_CODING_MODELS.map((m) => m.id));

export function isLocalModelId(id: string | undefined | null): boolean {
  return Boolean(id && LOCAL_IDS.has(id));
}

export function findLocalModel(id: string | undefined | null): LocalCodingModel | undefined {
  return id ? LOCAL_CODING_MODELS.find((m) => m.id === id) : undefined;
}

/** Convert a catalog entry into the UI's generic model option. */
export function toModelOption(model: LocalCodingModel, installed = false): ModelOption {
  const tier = model.tier === 'nano' ? 'fast' : model.tier;
  return {
    id: model.id,
    label: `${installed ? '✓ ' : ''}${model.label} · ${model.quant} · ~${model.minRamGb}GB`,
    tier: tier === 'deep' ? 'deep' : tier === 'balanced' ? 'balanced' : 'fast',
    group: 'local',
    installed,
  };
}

/**
 * Pick a local model per agent role, preferring models already installed and
 * fitting the available RAM. Pure and deterministic — no I/O.
 */
export function recommendLocalRouting(
  governor: Pick<GovernorStats, 'profile' | 'availableRamGb'>,
  installedIds: ReadonlySet<string> = new Set(),
): Record<AgentRole, string> {
  const budget =
    governor.profile === 'eco_ultra_light'
      ? Math.min(governor.availableRamGb, 3)
      : governor.profile === 'balanced_light'
        ? Math.min(governor.availableRamGb, 6)
        : Math.max(governor.availableRamGb, 8);

  const pick = (roles: AgentRole[], preferReasoning: boolean): string => {
    const candidates = LOCAL_CODING_MODELS.filter(
      (m) =>
        !m.heavy &&
        m.minRamGb <= budget &&
        roles.every((r) => m.recommendedRoles.includes(r)),
    ).sort((a, b) => {
      const ai = installedIds.has(a.id) ? 0 : 1;
      const bi = installedIds.has(b.id) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const ar = preferReasoning && a.strengths.includes('reasoning') ? 0 : 1;
      const br = preferReasoning && b.strengths.includes('reasoning') ? 0 : 1;
      if (ar !== br) return ar - br;
      return b.paramsB - a.paramsB || a.minRamGb - b.minRamGb;
    });
    return candidates[0]?.id || 'qwen2.5-coder:3b';
  };

  return {
    architect: pick(REASON, true),
    strategist: pick(REASON, true),
    builder_alpha: pick(CODE, false),
    builder_beta: pick(CODE, false),
    red_team: pick(REASON, true),
    synthesizer_healer: pick(ALL, true),
  };
}
