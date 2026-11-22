import type { AgentRole, GovernorStats, ModelRoutingConfig } from './types';
import { LOCAL_CODING_MODELS, recommendLocalRouting, toModelOption } from './local_models';
import { geminiModel } from './gemini_models';

export const AGENT_ROLE_LABELS: Record<AgentRole, { title: string; scope: string }> = {
  architect: {
    title: 'المعماري الاستباقي (Architect)',
    scope: 'تحليل المتطلبات، التوقعات الضمنية، وتخطيط الكيانات',
  },
  strategist: {
    title: 'المخطط الاستراتيجي (Strategist)',
    scope: 'تفكيك المهام، العقود البرمجية، وتوزيع الوحدات',
  },
  builder_alpha: {
    title: 'البنّاء الأساسي (Builder Alpha)',
    scope: 'توليد النواة، طبقة البيانات SQLite WAL، والمنطق',
  },
  builder_beta: {
    title: 'البنّاء التكميلي (Builder Beta)',
    scope: 'توليد Full-Stack API، التوثيق، وسكربتات التشغيل',
  },
  red_team: {
    title: 'فريق الهجوم العدائي (Red-Team)',
    scope: 'اختبارات الاختراق، الفحص الساكن، وحقن المدخلات',
  },
  synthesizer_healer: {
    title: 'المُصلح التلقائي (Synthesizer & Healer)',
    scope: 'توليف الحلول وإصلاح الإخفاقات مع التراجع الذري',
  },
};

export interface ModelOption {
  id: string;
  label: string;
  tier: 'fast' | 'balanced' | 'deep';
  group?: 'gemini' | 'local';
  installed?: boolean;
}

const GEMINI_MODELS: ModelOption[] = [
  { id: geminiModel('flash'), label: 'Gemini Flash (سريع واستباقي)', tier: 'fast', group: 'gemini' },
  { id: geminiModel('flashLite'), label: 'Gemini Flash-Lite (خفيف جداً)', tier: 'fast', group: 'gemini' },
  { id: geminiModel('balanced'), label: 'Gemini Flash (توليد برمجي متقدم)', tier: 'balanced', group: 'gemini' },
  { id: geminiModel('deep'), label: 'Gemini Pro (تدقيق ومعمارية عميقة)', tier: 'deep', group: 'gemini' },
];

// Gemini entries stay first so existing integrations/tests that rely on
// AVAILABLE_MODELS[3] keep resolving to gemini-4-carbon.
export const AVAILABLE_MODELS: ModelOption[] = [
  ...GEMINI_MODELS,
  ...LOCAL_CODING_MODELS.map((m) => toModelOption(m)),
];

export { isLocalModelId, findLocalModel, LOCAL_CODING_MODELS } from './local_models';

export const DEFAULT_ROLE_MODELS: ModelRoutingConfig = {
  architect: geminiModel('flash'),
  strategist: geminiModel('flash'),
  builder_alpha: geminiModel('balanced'),
  builder_beta: geminiModel('flash'),
  red_team: geminiModel('deep'),
  synthesizer_healer: geminiModel('balanced'),
};

const ECO_ULTRA_LIGHT_MODELS: ModelRoutingConfig = {
  architect: geminiModel('flashLite'),
  strategist: geminiModel('flashLite'),
  builder_alpha: 'qwen2.5-coder:3b',
  builder_beta: 'qwen2.5-coder:3b',
  red_team: geminiModel('flash'),
  synthesizer_healer: geminiModel('flash'),
};

const ALLOWED_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id));

// Updated by the server after each Ollama probe so local-first routing can
// prefer models that are actually present on this machine.
let installedLocalIds = new Set<string>();
export function setInstalledLocalModels(ids: string[]): void {
  installedLocalIds = new Set(ids);
}

export function resolveAsymmetricRouting(
  governor: Pick<GovernorStats, 'profile'> & Partial<Pick<GovernorStats, 'availableRamGb'>>,
  overrides?: Partial<Record<AgentRole, string>> | null,
): ModelRoutingConfig {
  const localFirst = process.env.OMEGA_LOCAL_FIRST === '1';
  const base: ModelRoutingConfig = localFirst
    ? recommendLocalRouting(
        { profile: governor.profile, availableRamGb: governor.availableRamGb ?? 8 },
        installedLocalIds,
      )
    : governor.profile === 'eco_ultra_light'
      ? { ...ECO_ULTRA_LIGHT_MODELS }
      : { ...DEFAULT_ROLE_MODELS };

  if (!overrides) return base;

  const roles = Object.keys(DEFAULT_ROLE_MODELS) as AgentRole[];
  for (const role of roles) {
    const candidate = overrides[role]?.trim();
    if (candidate && ALLOWED_MODEL_IDS.has(candidate)) {
      base[role] = candidate;
    }
  }

  return base;
}
