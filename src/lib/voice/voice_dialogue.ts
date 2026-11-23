/**
 * Bilingual two-way voice dialogue for GENESIS-OMEGA (v2 Phase 5).
 *
 * Deterministic intent routing executes REAL backend operations (work orders,
 * repository audit/hardening, self-healing, UI/system control) and never
 * pretends an action happened. General engineering dialogue is produced by the
 * guarded local bridge only: local_synthesis -> llama-bridge.generate(), with
 * explicit error codes, 60s timeout, AbortSignal and zero cloud fallback.
 */

import { t, type Language } from '../i18n';
import { brainInferenceOptions, resolveBrainModel, type BrainRole } from '../brains/brain_registry';
import { synthesizeTextWithBridge, type LocalTextSynthesisOutput } from '../local_synthesis';
import { validateRepoRoot } from '../enterprise/repo_ingest';

export type VoiceIntent =
  | 'work_order'
  | 'repo_audit'
  | 'repo_harden'
  | 'heal_project'
  | 'switch_language'
  | 'doctor_status'
  | 'summarize_orders'
  | 'dialogue';

export interface VoiceDialogueEvent {
  type: 'voice.dialogue';
  lang: Language;
  intent: VoiceIntent;
  actionExecuted: boolean;
  at: string;
  errorCode?: string;
}

export interface VoiceWorkOrderApi {
  create(input: { title: string; problemStatement: string; targetLang?: string }): { id: string; departmentIds: string[] };
  run(id: string): Promise<{ id: string; stage: string; finalScore?: number }>;
  list(): Array<{ id: string; stage: string; title: string }>;
}

export interface VoiceRepoApi {
  audit(repoPath: string): Promise<unknown>;
  evolve(repoPath: string, mode: 'harden-only' | 'full-evolve', goal?: string): Promise<unknown>;
}

export interface VoiceDialogueDeps {
  workOrders?: VoiceWorkOrderApi;
  repo?: VoiceRepoApi;
  healProject?: (projectId: number) => Promise<{ attempts: number; finalScore?: number }>;
  switchLanguage?: (lang: Language) => void;
  doctorSummary?: () => Promise<string> | string;
  installedModels?: ReadonlySet<string>;
  model?: string;
  synthesizeText?: typeof synthesizeTextWithBridge;
  onEvent?: (event: VoiceDialogueEvent) => void;
}

export interface VoiceDialogueInput {
  transcript: string;
  preferredLang?: 'auto' | Language;
  executeActions?: boolean;
  signal?: AbortSignal;
}

export interface VoiceDialogueResult {
  replyText: string;
  lang: Language;
  intent: VoiceIntent;
  actionExecuted: boolean;
  actionResult: Record<string, unknown> | null;
  audioUrl: string | null;
  ttsEngine: string;
  errorCode?: string;
}

const ARABIC_RANGE = /[\u0600-\u06FF]/g;
const LATIN_RANGE = /[A-Za-z]/g;
const WAKE_WORDS = /^(?:يا\s+(?:جينيسيس|أوميجا|genesis)|genesis|أوميجا|جينيسيس)\s*[,،:]?\s*/i;

/** Deterministic Unicode analysis: Arabic script beats Latin unless Latin dominates 2:1. */
export function detectSpokenLanguage(text: string): Language {
  const value = text || '';
  const arabic = (value.match(ARABIC_RANGE) || []).length;
  const latin = (value.match(LATIN_RANGE) || []).length;
  if (arabic > 0 && arabic * 2 >= latin) return 'ar';
  return 'en';
}

/** Deterministic bilingual intent router. No LLM is needed to choose an action. */
export function routeVoiceIntent(text: string, lang: Language): VoiceIntent {
  const value = (text || '').toLowerCase();

  if (/(أمر\s*عمل|ابن[ِيْ]?\s+[\p{L}0-9]+|أنشئ\s+[\p{L}0-9]+|اصنع\s+[\p{L}0-9]+|ابدأ\s+[\p{L}0-9]+)/u.test(value) && /(نظام|خدمة|مشروع|أمر|تطبيق|بنية)/.test(value)) {
    return 'work_order';
  }
  if (/\b(build|create|make|start)\b/.test(value) && /\b(system|service|work order|project|app|api)\b/.test(value)) {
    return 'work_order';
  }
  if (/(حص[ّن]?ن|افحص|دق[ّق]?ق|فحص|امسح)/.test(value) && /(مشروع|مستودع|مجلد|مسار|repo)/.test(value)) {
    return /(حص[ّن]?ن|harden)/.test(value) ? 'repo_harden' : 'repo_audit';
  }
  if (/\b(audit|harden|scan|inspect)\b/.test(value) && /\b(repo|repository|project|folder|path)\b/.test(value)) {
    return /\bharden\b/.test(value) ? 'repo_harden' : 'repo_audit';
  }
  if (/(أصلح|إصلاح|داو[ِي]?|عالج)/.test(value) && /(مشروع|رقم|خطأ|فشل)/.test(value)) return 'heal_project';
  if (/\b(heal|repair|fix)\b/.test(value) && /\b(project|error|failure|\d+)\b/.test(value)) return 'heal_project';
  if (/(بد[ّل]?ل|اغيّر|اجعل).*(لغة|إنجليزي|عربي)/.test(value) || /\bswitch\b.*\b(language|arabic|english)\b/.test(value)) {
    return 'switch_language';
  }
  if (/(حالة|فحص).*(أدوات|بيئة|نظام|دكتور)|دكتور/.test(value) || /\b(doctor|toolchain|check tools|runtime status)\b/.test(value)) {
    return 'doctor_status';
  }
  if (/(لخ[ّص]?ص|ملخص|اعرض).*(أوامر|مشاريع)|حالة الأوامر/.test(value) || /\b(summarize|list|status)\b.*\b(work orders|orders|projects)\b/.test(value)) {
    return 'summarize_orders';
  }
  return 'dialogue';
}

function cleanUtterance(text: string): string {
  return (text || '').replace(WAKE_WORDS, '').replace(/\s+/g, ' ').trim();
}

function extractProjectId(text: string): number | null {
  const match = /(?:مشروع\s*(?:رقم\s*)?|project\s*(?:number\s*|#\s*)?|#)(\d+)/i.exec(text);
  return match ? Number(match[1]) : null;
}

function extractRepoPath(text: string): string | null {
  const quoted = /"([^"]+)"|'([^']+)'/.exec(text);
  if (quoted) return (quoted[1] || quoted[2]).trim();
  const hinted = /(?:في|على|المسار|المجلد|at|in|path|under)\s+([A-Za-z]:[\\/][^\s]+|[\\/][^\s]+|[\w.-]+[\\/][^\s]+)/i.exec(text);
  return hinted ? hinted[1].trim() : null;
}

function extractLanguage(text: string, fallback: Language): Language {
  if (/\benglish|إنجليزي|الإنجليزية/i.test(text)) return 'en';
  if (/\barabic|عربي|العربية/i.test(text)) return 'ar';
  return fallback;
}

function dialogueSystemPrompt(lang: Language): string {
  return lang === 'ar'
    ? 'أنت المساعد الهندسي المحلي لـ GENESIS-OMEGA. أجب بالعربية الفصحى المبسطة بجمل قصيرة مناسبة للنطق، بلا تنسيق أو قوائم أو وعود كاذبة. إن لم تعرف فقل ذلك بوضوح. أعد JSON فقط: {"reply":"النص المنطوق"}.'
    : 'You are the local engineering assistant of GENESIS-OMEGA. Reply in concise spoken English, no formatting, no lists, never invent results. If you do not know, say so. Return STRICT JSON only: {"reply":"spoken text"}.';
}

/** Accept JSON replies from the bridge, but never emit raw control text to TTS. */
export function extractSpokenReply(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  try {
    const parsed = JSON.parse(value) as { reply?: unknown; text?: unknown; answer?: unknown; spokenReply?: unknown };
    const candidate = parsed.reply ?? parsed.text ?? parsed.answer ?? parsed.spokenReply;
    return typeof candidate === 'string' ? candidate.trim().slice(0, 800) : '';
  } catch {
    // plain text reply
  }
  return value.replace(/^```[\s\S]*?```$/, '').replace(/^["']|["']$/g, '').trim().slice(0, 800);
}

function failReply(lang: Language, key: Parameters<typeof t>[1], errorCode: string): VoiceDialogueResult {
  return {
    replyText: t(lang, key),
    lang,
    intent: 'dialogue',
    actionExecuted: false,
    actionResult: null,
    audioUrl: null,
    ttsEngine: 'web-speech',
    errorCode,
  };
}

/**
 * Execute a spoken utterance. Returns a fully localized, TTS-ready result.
 * Every failure is explicit; no action is simulated and no cloud call is made.
 */
export async function processVoiceDialogue(
  input: VoiceDialogueInput,
  deps: VoiceDialogueDeps = {},
): Promise<VoiceDialogueResult> {
  const raw = (input.transcript || '').trim();
  if (!raw) return failReply('en', 'voice.emptyTranscript', 'EMPTY_TRANSCRIPT');

  const lang: Language = input.preferredLang && input.preferredLang !== 'auto'
    ? input.preferredLang
    : detectSpokenLanguage(raw);
  const utterance = cleanUtterance(raw);
  const intent = routeVoiceIntent(utterance, lang);
  const execute = input.executeActions !== false;
  const emit = (result: VoiceDialogueResult): VoiceDialogueResult => {
    deps.onEvent?.({
      type: 'voice.dialogue',
      lang,
      intent,
      actionExecuted: result.actionExecuted,
      at: new Date().toISOString(),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });
    return result;
  };
  const done = (
    replyText: string,
    actionExecuted: boolean,
    actionResult: Record<string, unknown> | null,
    errorCode?: string,
  ): VoiceDialogueResult => emit({
    replyText,
    lang,
    intent,
    actionExecuted,
    actionResult,
    audioUrl: null,
    ttsEngine: 'web-speech',
    ...(errorCode ? { errorCode } : {}),
  });

  if (!execute) {
    return done(t(lang, 'voice.actionsDisabled'), false, { intent });
  }

  try {
    if (intent === 'work_order') {
      if (!deps.workOrders) return done(t(lang, 'voice.actionUnavailable'), false, null, 'ACTION_UNAVAILABLE');
      const order = deps.workOrders.create({
        title: utterance.slice(0, 120) || t(lang, 'voice.spokenOrder'),
        problemStatement: utterance,
        targetLang: lang === 'ar' ? 'arabic' : 'english',
      });
      const finished = await deps.workOrders.run(order.id);
      return done(
        t(lang, 'voice.orderCreated', { id: order.id, stage: finished.stage, departments: order.departmentIds.length }),
        true,
        { kind: 'work_order', id: order.id, stage: finished.stage, departmentIds: order.departmentIds },
      );
    }

    if (intent === 'repo_audit' || intent === 'repo_harden') {
      if (!deps.repo) return done(t(lang, 'voice.actionUnavailable'), false, null, 'ACTION_UNAVAILABLE');
      const repoPath = extractRepoPath(utterance);
      if (!repoPath) return done(t(lang, 'voice.repoPathMissing'), false, null, 'REPO_PATH_MISSING');
      const validation = validateRepoRoot(repoPath);
      if (!validation.ok) return done(t(lang, 'voice.unsafeRepoPath'), false, null, validation.code || 'UNSAFE_REPO_PATH');
      if (intent === 'repo_audit') {
        const outcome = await deps.repo.audit(validation.resolved);
        return done(t(lang, 'voice.repoAudited', { path: validation.resolved }), true, { kind: 'repo_audit', path: validation.resolved, outcome });
      }
      const outcome = await deps.repo.evolve(validation.resolved, 'harden-only', utterance);
      return done(t(lang, 'voice.repoHardened', { path: validation.resolved }), true, { kind: 'repo_harden', path: validation.resolved, outcome });
    }

    if (intent === 'heal_project') {
      if (!deps.healProject) return done(t(lang, 'voice.actionUnavailable'), false, null, 'ACTION_UNAVAILABLE');
      const projectId = extractProjectId(utterance);
      if (!projectId) return done(t(lang, 'voice.projectIdMissing'), false, null, 'PROJECT_ID_MISSING');
      const report = await deps.healProject(projectId);
      return done(
        t(lang, 'voice.healDone', { id: projectId, attempts: report.attempts }),
        true,
        { kind: 'heal_project', projectId, attempts: report.attempts },
      );
    }

    if (intent === 'switch_language') {
      const target = extractLanguage(utterance, lang);
      deps.switchLanguage?.(target);
      return emit({
        replyText: t(target, 'voice.languageSwitched'),
        lang: target,
        intent,
        actionExecuted: true,
        actionResult: { kind: 'switch_language', uiLanguage: target },
        audioUrl: null,
        ttsEngine: 'web-speech',
      });
    }

    if (intent === 'doctor_status') {
      if (!deps.doctorSummary) return done(t(lang, 'voice.actionUnavailable'), false, null, 'ACTION_UNAVAILABLE');
      const summary = await deps.doctorSummary();
      return done(t(lang, 'voice.doctorStatus', { summary }), true, { kind: 'doctor_status', summary });
    }

    if (intent === 'summarize_orders') {
      if (!deps.workOrders) return done(t(lang, 'voice.actionUnavailable'), false, null, 'ACTION_UNAVAILABLE');
      const orders = deps.workOrders.list();
      return done(
        t(lang, 'voice.ordersSummary', { n: orders.length, stages: orders.slice(0, 4).map((o) => o.stage).join(', ') || '—' }),
        true,
        { kind: 'summarize_orders', count: orders.length },
      );
    }
  } catch (err) {
    const code = err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : 'VOICE_ACTION_FAILED';
    return done(t(lang, 'voice.actionFailed', { detail: err instanceof Error ? err.message : String(err) }), false, null, code);
  }

  // General engineering dialogue: guarded local bridge only, language-matched reply.
  const role: BrainRole = 'architect';
  const options = brainInferenceOptions(role);
  const installed = deps.installedModels || new Set<string>();
  const model = deps.model || resolveBrainModel(role, installed);
  const synthesize = deps.synthesizeText || synthesizeTextWithBridge;
  const output: LocalTextSynthesisOutput = await synthesize({
    model,
    system: dialogueSystemPrompt(lang),
    prompt: utterance,
    numCtx: Math.min(options.numCtx, 4096),
    numPredict: Math.min(options.numPredict, 256),
    signal: input.signal,
  });
  if (output.error || !output.text.trim()) {
    return done(t(lang, 'voice.bridgeFailed'), false, null, output.errorCode || 'LOCAL_BRIDGE_FAILED');
  }
  const replyText = extractSpokenReply(output.text);
  if (!replyText) return done(t(lang, 'voice.bridgeFailed'), false, null, 'EMPTY_LOCAL_REPLY');
  return done(replyText, false, { kind: 'dialogue', model: output.modelUsed });
}
