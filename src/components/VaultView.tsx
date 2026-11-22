import React, { useMemo, useState } from 'react';
import { BookOpen, Brain, Search, Trash2 } from 'lucide-react';
import { AGENT_ROLE_LABELS } from '../lib/routing';
import type {
  AgentRole,
  CognitiveProfile,
  GovernorStats,
  ModelRoutingConfig,
  ProjectRecord,
  VaultEntry,
} from '../lib/types';

interface VaultViewProps {
  projects: ProjectRecord[];
  vault: VaultEntry[];
  cognitive: CognitiveProfile;
  governor: GovernorStats | null;
  activeRouting: ModelRoutingConfig | null;
  onAddVaultRule: (payload: { domain: string; pattern: string; verifiedWisdom: string }) => Promise<void>;
  onDeleteVaultRule: (id: number) => Promise<void>;
}

export const VaultView: React.FC<VaultViewProps> = ({
  projects,
  vault,
  cognitive,
  governor,
  activeRouting,
  onAddVaultRule,
  onDeleteVaultRule,
}) => {
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const [pattern, setPattern] = useState('');
  const [wisdom, setWisdom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const metrics = useMemo(() => {
    const total = projects.length;
    const verified = projects.filter((p) => p.status === 'verified').length;
    const avgScore =
      total > 0 ? Math.round(projects.reduce((s, p) => s + p.score, 0) / total) : 0;
    const totalTests = projects.reduce((s, p) => s + p.testsRun, 0);
    return { total, verified, avgScore, totalTests };
  }, [projects]);

  const filteredVault = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vault;
    return vault.filter(
      (v) =>
        v.domain.toLowerCase().includes(q) ||
        v.pattern.toLowerCase().includes(q) ||
        v.verifiedWisdom.toLowerCase().includes(q),
    );
  }, [vault, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim() || !pattern.trim() || !wisdom.trim()) {
      setError('يرجى تعبئة المجال والنمط والقاعدة الهندسية.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onAddVaultRule({
        domain: domain.trim(),
        pattern: pattern.trim(),
        verifiedWisdom: wisdom.trim(),
      });
      setDomain('');
      setPattern('');
      setWisdom('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ القاعدة الهندسية.');
    } finally {
      setBusy(false);
    }
  };

  const traitEntries = Object.entries(cognitive.traits || {});

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100">الإحصائيات وخزينة الخبرات المعرفية</h1>
        <p className="mt-1 text-sm text-slate-400">
          مؤشرات الإنتاجية الهندسية، ذاكرة الأنماط العابرة للمشاريع، والملف المعرفي للشريك الصوتي.
        </p>
      </div>

      {/* 5-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">إجمالي المشاريع</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {metrics.total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">المشاريع المُتحقّقة</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {metrics.verified}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">متوسط الجودة والأمان</div>
          <div className="mt-1 font-mono text-2xl font-bold text-cyan-400 tabular-nums">
            {metrics.avgScore}/100
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">الاختبارات المنجزة</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {metrics.totalTests}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-400">الذاكرة المتاحة (EcoGovernor)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-sky-400 tabular-nums">
            {governor ? `${governor.availableRamGb} GB` : '—'}
          </div>
        </div>
      </div>

      {/* EcoResourceGovernor Hardware Allocation & Asymmetric Model Routing */}
      {governor && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <span className="font-semibold text-slate-100">توزيع موارد العتاد الذكي (EcoResourceGovernor)</span>
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-400">
              <span>النظام: {governor.os}</span>
              <span aria-hidden="true">·</span>
              <span>الأنوية: {governor.cpuCores}</span>
              <span aria-hidden="true">·</span>
              <span>الذاكرة الكلية: {governor.totalRamGb} GB</span>
              <span aria-hidden="true">·</span>
              <span>الاستهلاك: {governor.ramUsedPct}%</span>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-400">الوضع: {governor.profile}</span>
            </div>
          </div>

          {activeRouting && (
            <div className="border-t border-slate-800 pt-3">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                مصفوفة التوجيه غير المتماثل للنماذج (Asymmetric Model Routing)
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(AGENT_ROLE_LABELS) as AgentRole[]).map((role) => (
                  <div
                    key={role}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <span className="text-slate-300 truncate">{AGENT_ROLE_LABELS[role].title}</span>
                    <span dir="ltr" className="font-mono text-cyan-300 shrink-0">
                      {activeRouting[role]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Knowledge Vault (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-100">خزينة الخبرات العابرة للمشاريع</h2>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <label htmlFor="vault-search" className="sr-only">بحث في الخبرات الهندسية</label>
              <input
                id="vault-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث في القواعد الهندسية..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pr-8 pl-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <form
            onSubmit={(e) => void handleAdd(e)}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="vault-domain" className="block text-xs text-slate-400 mb-1">
                  المجال التقني
                </label>
                <input
                  id="vault-domain"
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="مثال: SQLite & Concurrency"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="vault-pattern" className="block text-xs text-slate-400 mb-1">
                  النمط الهندسي
                </label>
                <input
                  id="vault-pattern"
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="مثال: Parameterized Migrations"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="vault-wisdom" className="block text-xs text-slate-400 mb-1">
                الخبرة المُتحقّقة (تُحقن تلقائياً في مرحلة التفكير المعماري)
              </label>
              <textarea
                id="vault-wisdom"
                rows={2}
                value={wisdom}
                onChange={(e) => setWisdom(e.target.value)}
                placeholder="صف القاعدة الهندسية التي يجب فرضها في المشاريع القادمة..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'جاري الحفظ...' : 'إضافة قاعدة إلى الخزينة'}
            </button>
          </form>

          <div className="space-y-2.5">
            {filteredVault.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
                لا توجد قواعد مطابقة لبحثك.
              </div>
            ) : (
              filteredVault.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-cyan-400">{entry.domain}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-medium text-slate-200">{entry.pattern}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">{entry.verifiedWisdom}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDeleteVaultRule(entry.id)}
                    aria-label={`حذف قاعدة ${entry.pattern}`}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cognitive User Profile & Recent Dialogue (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-100">الملف المعرفي وسجل الحوار</h2>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-300">السمات الهندسية المكتشفة من الحوار</h3>
            {traitEntries.length === 0 ? (
              <p className="text-xs text-slate-500">لم يتم تسجيل تفضيلات شخصية بعد.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {traitEntries.map(([k, v]) => (
                  <li
                    key={k}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800/80 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-slate-200">{v}</span>
                    <span dir="ltr" className="font-mono text-[11px] text-slate-400 shrink-0">
                      {k}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-300">آخر جولات الحوار الصوتي</h3>
            <div className="max-h-80 space-y-2.5 overflow-y-auto pl-1">
              {cognitive.recentDialogue.slice(-8).map((turn) => (
                <div
                  key={turn.id}
                  className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                    turn.role === 'user'
                      ? 'border-slate-700 bg-slate-950/90 text-slate-200'
                      : 'border-slate-800 bg-slate-900 text-sky-100'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold">
                      {turn.role === 'user' ? 'أنت' : 'جينيسيس'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Date(turn.createdAt).toLocaleTimeString('ar-EG')}
                    </span>
                  </div>
                  <p>{turn.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
