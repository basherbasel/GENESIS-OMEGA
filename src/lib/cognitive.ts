import { detectEcosystem } from './ecosystems';
import type {
  CognitiveEmotion,
  GovernorStats,
  MindsetAnalysis,
  PendingSuggestion,
  ProjectRecord,
  ThinkingStyle,
  UiCommand,
} from './types';

export const WAKE_WORDS_REGEX =
  /^(?:يا\s+جينيسيس|يا\s+جنيسيس|يا\s+أوميجا|يا\s+اوميجا|جينيسيس|أوميجا|genesis|omega)[،,:\s-]*/i;

const AFFIRMATION_SET = new Set([
  'نعم',
  'أيوه',
  'ايوه',
  'اه',
  'آه',
  'تمام',
  'موافق',
  'ماشي',
  'يلا',
  'يلا بينا',
  'نفذ',
  'اعمل كده',
  'توكل على الله',
  'أكيد',
  'اكيد',
  'بالضبط',
  'yes',
  'ok',
  'do it',
  'sure',
]);

const STYLE_LABELS: Record<ThinkingStyle, string> = {
  architectural_visionary: 'تخطيط معماري استراتيجي',
  action_executor: 'تنفيذي سريع حاسم',
  analytical_explorer: 'تحليلي استكشافي',
  collaborative_builder: 'بناء تعاوني متوازن',
};

const EMOTION_LABELS: Record<CognitiveEmotion, string> = {
  empathetic_focused: 'تركيز هادئ لحل المشكلة',
  warm_enthusiastic: 'حماس وإيجابية',
  crisp_energetic: 'إيقاع سريع وإنجاز',
  calm_human: 'حوار هادئ متزن',
};

export function stripWakeWord(text: string): string {
  return (text || '').trim().replace(WAKE_WORDS_REGEX, '').trim();
}

const NEGATION_TOKENS = new Set(['لا', 'لأ', 'مش', 'ليس', 'توقف', 'الغي', 'الغاء', 'إلغاء', 'no', 'not', 'cancel', 'stop']);

export function isAffirmation(text: string): boolean {
  const clean = (text || '').trim().toLowerCase().replace(/[؟?!.,،]/g, '').trim();
  if (!clean) return false;
  if (AFFIRMATION_SET.has(clean)) return true;
  const words = clean.split(/\s+/);
  if (words.some((w) => NEGATION_TOKENS.has(w))) return false;
  if (words.length <= 5) {
    if (AFFIRMATION_SET.has(words[0]) && words.some((w) => AFFIRMATION_SET.has(w))) {
      return true;
    }
    for (const phrase of AFFIRMATION_SET) {
      if (phrase.includes(' ') && clean.includes(phrase)) {
        return true;
      }
    }
  }
  return false;
}

export function extractProjectId(text: string): number | null {
  const m1 = text.match(/(?:رقم|مشروع|#)\s*(\d+)/);
  if (m1) return Number(m1[1]);
  const m2 = text.match(/\b(\d+)\b/);
  return m2 ? Number(m2[1]) : null;
}

export function analyzeMindsetAndEmotion(text: string): {
  mindset: MindsetAnalysis;
  discoveredTraits: Record<string, string>;
} {
  const low = (text || '').toLowerCase();
  const discoveredTraits: Record<string, string> = {};

  if (/(بدون إنترنت|اوفلاين|أوفلاين|محلي|offline|local)/.test(low)) {
    discoveredTraits.deployment_preference = 'يفضل العمل المحلي المستقل بدون إنترنت (Offline-First)';
  }
  if (/(خفيف|رام|سريع|بدون تعقيد|zero-bloat|lightweight)/.test(low)) {
    discoveredTraits.architecture_style = 'يفضل البنية الخفيفة عالية الكفاءة قليلة استهلاك الذاكرة';
  }
  if (/(أمان|ثغرات|حماية|تشفير|security|hardened|sbom)/.test(low)) {
    discoveredTraits.priority_focus = 'يعطي أولوية قصوى للأمان السيبراني وتحصين الكود';
  }

  let thinkingStyle: ThinkingStyle = 'collaborative_builder';
  if (/(معمارية|تصميم|تخطيط|خارطة|رؤية|نظام متكامل|هيكل)/.test(low)) {
    thinkingStyle = 'architectural_visionary';
  } else if (/(بسرعة|فوراً|دلوقتي|حالاً|يلا|ابدأ|نفذ)/.test(low)) {
    thinkingStyle = 'action_executor';
  } else if (/(ليه|إزاي|كيف|اشرح|فهمني|رأيك|تفكر|مقارنة)/.test(low)) {
    thinkingStyle = 'analytical_explorer';
  }

  let emotion: CognitiveEmotion = 'calm_human';
  let prosody = { rate: 1.02, pitch: 1.0 };

  if (/(مشكلة|خطأ|عطل|باظ|مش شغال|بطيء|قلقان|تعبني)/.test(low)) {
    emotion = 'empathetic_focused';
    prosody = { rate: 0.96, pitch: 0.96 };
  } else if (/(ممتاز|عاش|رائع|حلو|تمام|جميل|برافو)/.test(low)) {
    emotion = 'warm_enthusiastic';
    prosody = { rate: 1.06, pitch: 1.05 };
  } else if (/(مستعجل|بسرعة|فوراً|أنجز)/.test(low)) {
    emotion = 'crisp_energetic';
    prosody = { rate: 1.12, pitch: 1.02 };
  }

  return {
    mindset: {
      thinkingStyle,
      thinkingStyleLabel: STYLE_LABELS[thinkingStyle],
      emotion,
      emotionLabel: EMOTION_LABELS[emotion],
      prosody,
    },
    discoveredTraits,
  };
}

export interface DeterministicRouteResult {
  handledAsAction: boolean;
  intent: string;
  spokenReply: string;
  uiCommand: UiCommand | null;
  actionToExecute?: {
    type:
      | 'stop_sandbox'
      | 'start_sandbox'
      | 'benchmark'
      | 'migrate_legacy'
      | 'create_project'
      | 'system_status'
      | 'heal_project';
    projectId?: number;
    prompt?: string;
    title?: string;
  };
  newPendingSuggestion?: PendingSuggestion | null;
}

export function routeVoiceIntent(
  rawTranscript: string,
  options: {
    activeProjectId: number | null;
    projects: ProjectRecord[];
    governor: GovernorStats;
    pendingSuggestion: PendingSuggestion | null;
    traits: Record<string, string>;
  },
): DeterministicRouteResult {
  const cleanCmd = stripWakeWord(rawTranscript);
  if (!cleanCmd) {
    return {
      handledAsAction: true,
      intent: 'wake_ack',
      spokenReply: 'نعم، أنا جاهز وأستمع إليك. تفضل بإصدار أمرك البرمجي أو التشغيلي.',
      uiCommand: null,
    };
  }

  const low = cleanCmd.toLowerCase();
  const targetPid =
    extractProjectId(cleanCmd) ?? options.activeProjectId ?? (options.projects[0]?.id ?? null);

  // 1. Multi-turn affirmation of pending suggestion
  if (options.pendingSuggestion && isAffirmation(cleanCmd)) {
    const sug = options.pendingSuggestion;
    if (sug.action === 'benchmark' && sug.projectId) {
      return {
        handledAsAction: true,
        intent: 'benchmark',
        spokenReply: `تمام، سأنفذ لك اختبار الضغط والأداء على المشروع رقم ${sug.projectId} فوراً.`,
        uiCommand: { action: 'select_project', projectId: sug.projectId, tab: 'benchmark' },
        actionToExecute: { type: 'benchmark', projectId: sug.projectId },
        newPendingSuggestion: null,
      };
    }
    if (sug.action === 'create_project') {
      const eco = detectEcosystem(sug.payload);
      const cleanTitle =
        sug.payload
          .replace(/^(?:بفكر أعمل|عايز أعمل|فكرة|ابني|أنشئ|انشئ|صمم|برمج)\s+/i, '')
          .trim()
          .slice(0, 50) || 'مشروع صوتي ذكي';
      return {
        handledAsAction: true,
        intent: 'create_project',
        spokenReply: `على بركة الله! أطلقت خط الإنتاج لبناء ${cleanTitle} ببيئة ${eco.displayName}.`,
        uiCommand: { action: 'switch_view', view: 'studio' },
        actionToExecute: { type: 'create_project', title: cleanTitle, prompt: sug.payload },
        newPendingSuggestion: null,
      };
    }
  }

  // 2. Stop Sandbox
  if (/(أوقف|اوقف|إيقاف|ايقاف|اقفل|stop sandbox|stop server)/.test(low)) {
    if (!targetPid) {
      return {
        handledAsAction: true,
        intent: 'stop_sandbox',
        spokenReply: 'لا يوجد مشروع نشط لإيقافه حالياً.',
        uiCommand: null,
      };
    }
    return {
      handledAsAction: true,
      intent: 'stop_sandbox',
      spokenReply: `تم إيقاف البيئة المعزولة للمشروع رقم ${targetPid} وتحرير المنفذ بنجاح.`,
      uiCommand: { action: 'select_project', projectId: targetPid, tab: 'sandbox' },
      actionToExecute: { type: 'stop_sandbox', projectId: targetPid },
    };
  }

  // 3. Start Sandbox
  if (/(شغل|تشغيل|افتح التطبيق|جرب المشروع|run sandbox|start project)/.test(low)) {
    if (!targetPid) {
      return {
        handledAsAction: true,
        intent: 'start_sandbox',
        spokenReply: 'لا يوجد مشروع جاهز للتشغيل بعد.',
        uiCommand: null,
      };
    }
    return {
      handledAsAction: true,
      intent: 'start_sandbox',
      spokenReply: `تم تشغيل المشروع رقم ${targetPid} في البيئة المعزولة بنجاح.`,
      uiCommand: { action: 'select_project', projectId: targetPid, tab: 'sandbox' },
      actionToExecute: { type: 'start_sandbox', projectId: targetPid },
    };
  }

  // 4. Performance Benchmark
  if (/(اختبر الأداء|اختبار الأداء|قيس السرعة|الضغط|benchmark|rps|latency)/.test(low)) {
    if (!targetPid) {
      return {
        handledAsAction: true,
        intent: 'benchmark',
        spokenReply: 'لا يوجد مشروع محدد لاختبار أدائه حالياً.',
        uiCommand: null,
      };
    }
    return {
      handledAsAction: true,
      intent: 'benchmark',
      spokenReply: `تم تنفيذ اختبار الضغط وقياس سرعة الاستجابة للمشروع رقم ${targetPid}.`,
      uiCommand: { action: 'select_project', projectId: targetPid, tab: 'benchmark' },
      actionToExecute: { type: 'benchmark', projectId: targetPid },
    };
  }

  // 5. Legacy Migration
  if (/(حدث الكود القديم|ترجم الكود القديم|هجرة|migrate|modernize|legacy)/.test(low)) {
    if (!targetPid) {
      return {
        handledAsAction: true,
        intent: 'migrate_legacy',
        spokenReply: 'تم فتح مختبر هجرة الأنظمة القديمة.',
        uiCommand: { action: 'switch_view', view: 'migration' },
      };
    }
    return {
      handledAsAction: true,
      intent: 'migrate_legacy',
      spokenReply: `جاري تحليل وتحديث الملفات القديمة في المشروع رقم ${targetPid} إلى بنية حديثة آمنة.`,
      uiCommand: { action: 'select_project', projectId: targetPid, tab: 'files' },
      actionToExecute: { type: 'migrate_legacy', projectId: targetPid },
    };
  }

  // 6. Autonomous Self-Healing
  if (/(أصلح|إصلاح|صلح|اعالج|عالج|ترميم|heal|repair|self.heal|fix the bugs)/.test(low)) {
    if (!targetPid) {
      return {
        handledAsAction: true,
        intent: 'heal_project',
        spokenReply: 'لا يوجد مشروع محدد لإطلاق وكيل الإصلاح الذاتي عليه بعد.',
        uiCommand: null,
      };
    }
    return {
      handledAsAction: true,
      intent: 'heal_project',
      spokenReply: `سأشغّل وكيل الإصلاح الذاتي على المشروع رقم ${targetPid}: تشخيص، ترقيع، ثم تحقق فعلي قبل اعتماد أي تغيير.`,
      uiCommand: { action: 'select_project', projectId: targetPid, tab: 'healing' },
      actionToExecute: { type: 'heal_project', projectId: targetPid },
    };
  }

  // 7. SBOM & Supply Chain
  if (/(سلسلة التوريد|الأسرار|sbom|supply chain)/.test(low)) {
    return {
      handledAsAction: true,
      intent: 'show_sbom',
      spokenReply: 'تم فتح تقرير حوكمة سلسلة التوريد وفحص الأسرار CycloneDX SBOM.',
      uiCommand: targetPid
        ? { action: 'select_project', projectId: targetPid, tab: 'sbom' }
        : { action: 'switch_view', view: 'studio' },
    };
  }

  // 8. System Status & Memory
  if (/(حالة النظام|الذاكرة|الرام|حالة المشاريع|كم مشروع|status|health)/.test(low)) {
    const verifiedCount = options.projects.filter((p) => p.status === 'verified').length;
    return {
      handledAsAction: true,
      intent: 'system_status',
      spokenReply: `النظام يعمل بوضع ${options.governor.profile}، والذاكرة المتاحة حالياً ${options.governor.availableRamGb} جيجابايت من أصل ${options.governor.totalRamGb}. لديك ${options.projects.length} مشاريع في الشركة، منها ${verifiedCount} مشاريع مُتحقّقة بالكامل.`,
      uiCommand: { action: 'refresh' },
      actionToExecute: { type: 'system_status' },
    };
  }

  // 9. UI Navigation
  if (/(المخططات|مخطط|erd|mermaid|diagrams)/.test(low)) {
    return {
      handledAsAction: true,
      intent: 'show_diagrams',
      spokenReply: 'تم فتح مخططات العمارة والبيانات للمشروع.',
      uiCommand: targetPid
        ? { action: 'select_project', projectId: targetPid, tab: 'diagrams' }
        : { action: 'switch_view', view: 'studio' },
    };
  }
  if (/(دوكر|حاوية|حاويات|docker|compose)/.test(low)) {
    return {
      handledAsAction: true,
      intent: 'show_docker',
      spokenReply: 'تم فتح حزمة النشر عبر حاويات Docker وملف docker-compose.',
      uiCommand: targetPid
        ? { action: 'select_project', projectId: targetPid, tab: 'docker' }
        : { action: 'switch_view', view: 'studio' },
    };
  }
  if (/(خزينة|الخبرات|الإحصائيات|vault|analytics)/.test(low)) {
    return {
      handledAsAction: true,
      intent: 'open_vault',
      spokenReply: 'تم الانتقال إلى لوحة الإحصائيات وخزينة الخبرات الهندسية.',
      uiCommand: { action: 'switch_view', view: 'vault' },
    };
  }
  if (/(مراقبة المجلدات|المراقبة|watcher)/.test(low)) {
    return {
      handledAsAction: true,
      intent: 'open_watch',
      spokenReply: 'تم فتح نظام المراقبة والتدقيق التلقائي للمجلدات.',
      uiCommand: { action: 'switch_view', view: 'watch' },
    };
  }

  // 10. Explicit Build Command
  if (/^(?:ابني|ابنِ|أنشئ|انشئ|صمم|برمج|اعمل|سوي|create|build|make)\b/i.test(cleanCmd)) {
    const eco = detectEcosystem(cleanCmd);
    const cleanTitle =
      cleanCmd
        .replace(/^(?:لو سمحت|من فضلك|يا نظام|ابني|ابنِ|أنشئ|انشئ|صمم|برمج|اعمل|سوي|create|build|make)\s+/i, '')
        .trim()
        .slice(0, 52) || 'مشروع صوتي ذكي';
    return {
      handledAsAction: true,
      intent: 'create_project',
      spokenReply: `تم استلام أمرك وإطلاق خط الإنتاج لبناء مشروع ${cleanTitle} باستخدام بيئة ${eco.displayName}.`,
      uiCommand: { action: 'switch_view', view: 'studio' },
      actionToExecute: { type: 'create_project', title: cleanTitle, prompt: cleanCmd },
      newPendingSuggestion: null,
    };
  }

  // 11. Conversational Cognitive Dialogue fallback (used directly if Gemini is not called or as structured partner)
  if (/(بطيء|ضغط|سرعة|أداء|يتحمل|كراش|يهنج)/.test(low) && targetPid) {
    return {
      handledAsAction: false,
      intent: 'human_dialogue',
      spokenReply: `فهمت قلقك تماماً، أنت تركز على صمود النظام تحت الحمل الحقيقي قبل الإطلاق. تحب أشغّل الآن اختبار ضغط وسرعة استجابة على المشروع رقم ${targetPid} ونراجع الأرقام سوياً؟`,
      uiCommand: null,
      newPendingSuggestion: { action: 'benchmark', projectId: targetPid, payload: '' },
    };
  }

  if (/(فكرة|عايز أعمل|بفكر أعمل|نفسي|محتاج نظام|تطبيق|مشروع|أداة)/.test(low)) {
    const eco = detectEcosystem(cleanCmd);
    return {
      handledAsAction: false,
      intent: 'human_dialogue',
      spokenReply: `فكرة عملية ممتازة، وواضح أنك تفضل بنية خفيفة ومستقلة. أنسب بيئة لها هي ${eco.displayName} مع قاعدة بيانات محلية وحماية أمنية كاملة. تحب أبدأ بناء المشروع الآن فوراً؟`,
      uiCommand: null,
      newPendingSuggestion: { action: 'create_project', projectId: targetPid, payload: cleanCmd },
    };
  }

  if (/(مين أنت|أنت مين|بتفهمني|إزيك|عامل إيه|السلام عليكم|صباح|مساء)/.test(low)) {
    const traitList = Object.values(options.traits);
    const traitNote = traitList.length > 0 ? ` وأتذكر جيداً أنك تركز دائماً على: ${traitList[0]}.` : '';
    return {
      handledAsAction: false,
      intent: 'human_dialogue',
      spokenReply: `أهلاً بك يا هندسة! أنا جينيسيس، شريكك الهندسي الذكي.${traitNote} احكِ لي ما تفكر فيه الآن، سواء مشروعاً جديداً نبدأه أو مشكلة تقنية نحلها معاً.`,
      uiCommand: null,
      newPendingSuggestion: null,
    };
  }

  return {
    handledAsAction: false,
    intent: 'human_dialogue',
    spokenReply:
      'أنا أسمعك وأفهم سياق تفكيرك. أخبرني بالفكرة التي في ذهنك بطريقتك الطبيعية، وسأقترح عليك البنية الهندسية الأنسب ثم نبدأ البناء والاختبار فوراً.',
    uiCommand: null,
    newPendingSuggestion: null,
  };
}
