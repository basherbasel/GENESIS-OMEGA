/**
 * Minimal typed UI localization for the studio shell.
 *
 * Only static interface strings are translated. Project titles, AI-generated
 * reports and verifier output are data and stay in their original language.
 * Time/space: O(1) lookup per string, no runtime dependency.
 */

export type Language = 'ar' | 'en';

export interface TranslationEntry {
  ar: string;
  en: string;
}

export const TRANSLATIONS = {
  'nav.main': { ar: 'التنقل الرئيسي', en: 'Main navigation' },
  'nav.studio': { ar: 'خط الإنتاج', en: 'Production line' },
  'nav.solutions': { ar: 'كتالوج الحلول', en: 'Solution catalog' },
  'nav.watch': { ar: 'مراقبة المجلدات', en: 'Folder watch' },
  'nav.vault': { ar: 'الإحصائيات والخبرات', en: 'Statistics & knowledge' },
  'nav.dashboard': { ar: 'لوحة القياسات', en: 'Dashboard' },
  'nav.migration': { ar: 'هجرة الأنظمة', en: 'Legacy migration' },
  'nav.enterprise': { ar: 'أوامر الشركة', en: 'Work Orders' },
  'action.newProject': { ar: 'مشروع جديد', en: 'New project' },
  'lang.toggle': { ar: 'English', en: 'العربية' },
  'lang.aria': { ar: 'تغيير لغة الواجهة', en: 'Switch interface language' },

  'dash.title': { ar: 'لوحة القياسات', en: 'Dashboard' },
  'dash.subtitle': {
    ar: 'كل الأرقام مشتقة من الحالة الحقيقية في المتجر — لا قيم مُقدَّرة ولا إحصاءات مُختلقة.',
    en: 'Every figure comes from real state in the store — no estimates and no fabricated statistics.',
  },
  'dash.aria': { ar: 'مؤشرات أساسية', en: 'Key indicators' },
  'dash.projects': { ar: 'المشاريع', en: 'Projects' },
  'dash.projectsHint': { ar: 'المخزون الكلي', en: 'Total in store' },
  'dash.verified': { ar: 'مُتحقّق', en: 'Verified' },
  'dash.reviewHint': { ar: 'يحتاج مراجعة: {n}', en: 'Needs review: {n}' },
  'dash.avgScore': { ar: 'متوسط الجودة', en: 'Average score' },
  'dash.tests': { ar: 'الاختبارات المنفذة', en: 'Tests executed' },
  'dash.testsHint': { ar: 'عدّها المتحقق فعلياً', en: 'Counted by the real verifier' },
  'dash.redTeam': { ar: 'صامد Red-Team', en: 'Red-Team survived' },
  'dash.maxRps': { ar: 'أقصى RPS', en: 'Peak RPS' },
  'dash.rpsHint': { ar: 'قياس HTTP حقيقي', en: 'Real HTTP measurement' },
  'dash.scores': { ar: 'درجات المشاريع', en: 'Project scores' },
  'dash.noProjects': { ar: 'لا توجد مشاريع بعد.', en: 'No projects yet.' },
  'dash.host': { ar: 'حالة المضيف والتوجيه', en: 'Host & routing state' },
  'dash.os': { ar: 'النظام', en: 'OS' },
  'dash.cores': { ar: 'الأنوية', en: 'CPU cores' },
  'dash.memory': { ar: 'الذاكرة المتاحة', en: 'Available memory' },
  'dash.profile': { ar: 'الملف المعرفي', en: 'Governor profile' },
  'dash.architect': { ar: 'المعماري', en: 'Architect' },
  'dash.builder': { ar: 'البنّاء', en: 'Builder' },
  'dash.ecosystems': { ar: 'توزيع البيئات', en: 'Ecosystem distribution' },
  'dash.noData': { ar: 'لا بيانات', en: 'No data' },
  'dash.benchmark': { ar: 'القياس الحقيقي', en: 'Real benchmark' },
  'dash.noBenchmark': { ar: 'لم يُقَس أي أداء بعد.', en: 'No performance measured yet.' },
  'dash.healing': { ar: 'الإصلاح الذاتي', en: 'Self-healing' },
  'dash.noHealing': { ar: 'لا دورات إصلاح مسجّلة.', en: 'No healing cycles recorded.' },
  'dash.patches': { ar: 'ترقيع', en: 'patches' },

  'ent.title': { ar: 'أوامر العمل الهندسية', en: 'Engineering Work Orders' },
  'ent.subtitle': {
    ar: 'شركة برمجيات محلية: أقسام متخصصة، عقول Ollama، تحقق OS حقيقي، وفشل مغلق صريح.',
    en: 'A local software house: specialized departments, Ollama brains, real OS verification and explicit fail-closed states.',
  },
  'ent.departments': { ar: 'الأقسام العشرة', en: 'Ten departments' },
  'ent.workOrders': { ar: 'أوامر العمل', en: 'Work orders' },
  'ent.newOrder': { ar: 'أمر عمل جديد', en: 'New work order' },
  'ent.titleField': { ar: 'عنوان أمر العمل', en: 'Work order title' },
  'ent.problemField': { ar: 'المشكلة أو المتطلب الهندسي', en: 'Problem or engineering requirement' },
  'ent.targetLang': { ar: 'اللغة المستهدفة (اختياري)', en: 'Target language (optional)' },
  'ent.create': { ar: 'إنشاء وتشغيل', en: 'Create & run' },
  'ent.run': { ar: 'تشغيل', en: 'Run' },
  'ent.stage': { ar: 'المرحلة', en: 'Stage' },
  'ent.score': { ar: 'الدرجة', en: 'Score' },
  'ent.tests': { ar: 'الاختبارات', en: 'Tests' },
  'ent.error': { ar: 'خطأ', en: 'Error' },
  'ent.noOrders': { ar: 'لا توجد أوامر عمل بعد.', en: 'No work orders yet.' },
  'ent.activeDeps': { ar: 'الأقسام النشطة', en: 'Active departments' },
  'ent.contracts': { ar: 'القواعد الهندسية', en: 'Engineering contracts' },
  'ent.gates': { ar: 'بوابات التحقق', en: 'Verification gates' },
  'ent.ingest': { ar: 'صيانة مستودع قائم', en: 'Maintain existing repository' },
  'ent.ingestHint': {
    ar: 'قراءة فقط: تدقيق خط الأساس لا يمسّ الملفات، والتطوير يكتب فقط بعد اجتياز بوابة الترقية.',
    en: 'Read-only baseline audit; evolution writes only after the promotion gate passes.',
  },
  'ent.ingestPath': { ar: 'مسار المستودع على القرص', en: 'Repository path on disk' },
  'ent.ingestMode': { ar: 'وضع التطوير', en: 'Evolution mode' },
  'ent.mode.harden': { ar: 'تحصين فقط', en: 'Harden only' },
  'ent.mode.feature': { ar: 'تطوير ميزة', en: 'Develop feature' },
  'ent.mode.full': { ar: 'تطوّر كامل', en: 'Full evolve' },
  'ent.ingestGoal': { ar: 'الهدف الهندسي (مطلوب لوضع تطوير الميزة)', en: 'Engineering goal (required for develop-feature)' },
  'ent.ingestAudit': { ar: 'تدقيق خط الأساس', en: 'Baseline audit' },
  'ent.ingestEvolve': { ar: 'التطوير والتحصين', en: 'Evolve & harden' },
  'ent.ingestStages': { ar: 'المراحل المباشرة', en: 'Live stages' },
  'ent.ingestRuns': { ar: 'سجل العمليات', en: 'Run history' },
  'ent.ingestNoRuns': { ar: 'لا توجد عمليات تدوير مسجّلة بعد.', en: 'No ingestion runs recorded yet.' },
  'ent.ingestStatus': { ar: 'الحالة', en: 'Status' },
  'ent.ingestChanged': { ar: 'ملفات معدّلة', en: 'Changed files' },
  'ent.ingestNoStages': { ar: 'بانتظار مرحلة من الخادم…', en: 'Waiting for a stage from the server…' },
} satisfies Record<string, TranslationEntry>;

export type TranslationKey = keyof typeof TRANSLATIONS;

export const ALL_TRANSLATION_KEYS = Object.keys(TRANSLATIONS) as TranslationKey[];

/** Translate a static key; missing keys fall back to the key itself. */
export function t(lang: Language, key: TranslationKey, vars?: Record<string, string | number>): string {
  const entry = TRANSLATIONS[key] as TranslationEntry | undefined;
  if (!entry) return key;
  let value = entry[lang];
  for (const [name, replacement] of Object.entries(vars || {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

export function isLanguage(value: unknown): value is Language {
  return value === 'ar' || value === 'en';
}

const STORAGE_KEY = 'omega.language';

export function readStoredLanguage(): Language {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(raw) ? raw : 'ar';
  } catch {
    return 'ar';
  }
}

export function persistLanguage(language: Language): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable (private mode); language still works in memory.
  }
}
