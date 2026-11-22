import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Boxes, ChevronLeft, CircleAlert, Code2, FileCode2, LoaderCircle, Search, TestTube2 } from 'lucide-react';
import { ECOSYSTEM_CATALOG } from '../lib/ecosystems';
import type { SolutionDomainSummary, SolutionGenerationResult } from '../lib/types';

interface SolutionCatalogViewProps {
  onPromoteToProject: (domain: SolutionDomainSummary, title: string, prompt: string) => Promise<void>;
}

export const SolutionCatalogView: React.FC<SolutionCatalogViewProps> = ({ onPromoteToProject }) => {
  const [domains, setDomains] = useState<SolutionDomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selected, setSelected] = useState<SolutionDomainSummary | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SolutionGenerationResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/solutions/domains')
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error('تعذر تحميل الكتالوج'))))
      .then((data: { domains: SolutionDomainSummary[] }) => {
        if (!cancelled) setDomains(data.domains || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(domains.map((d) => d.category))).sort()],
    [domains],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return domains.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (!q) return true;
      return (
        d.id.includes(q) ||
        d.labelAr.includes(q) ||
        d.labelEn.toLowerCase().includes(q) ||
        d.descriptionAr.includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [domains, query, category]);

  const handleGenerate = useCallback(async () => {
    if (!selected) return;
    setGenerating(true);
    setGenError(null);
    setResult(null);
    try {
      const resp = await fetch('/api/solutions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: selected.id,
          title: title.trim() || selected.labelAr,
          prompt: prompt.trim() || selected.descriptionAr,
        }),
      });
      const data = (await resp.json()) as SolutionGenerationResult & { error?: string };
      if (!resp.ok) throw new Error(data.error || 'تعذر توليد الحل.');
      setResult(data);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'خطأ غير معروف أثناء التوليد.');
    } finally {
      setGenerating(false);
    }
  }, [selected, title, prompt]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
        <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Boxes className="h-5 w-5 text-cyan-400" aria-hidden="true" />
            كتالوج الحلول الهندسية
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {domains.length} نطاقاً حقيقياً يغطي كل المنظومات البرمجية — كل حل يُولّد شيفرة واختبارات ووثائق وCI، ثم يُتحقق منه على القرص.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="domain-search" className="sr-only">بحث في النطاقات</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <input
              id="domain-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن نطاق أو لغة..."
              className="w-56 rounded-lg border border-slate-700 bg-slate-950 py-2 pr-8 pl-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <select
            aria-label="تصنيف النطاق"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'كل التصنيفات' : c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-5">
          {filtered.length === 0 && (
            <p className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">لا توجد نطاقات مطابقة.</p>
          )}
          {filtered.map((d) => {
            const eco = ECOSYSTEM_CATALOG[d.ecosystem];
            const isActive = selected?.id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setSelected(d);
                  setTitle(d.labelAr);
                  setPrompt(d.descriptionAr);
                  setResult(null);
                  setGenError(null);
                }}
                className={`w-full rounded-lg border p-3 text-right transition-colors cursor-pointer ${
                  isActive
                    ? 'border-cyan-500/70 bg-cyan-950/30'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">{d.labelAr}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{d.ecosystem}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{d.descriptionAr}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span>{d.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{eco?.displayName || d.ecosystem}</span>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr">{d.testCommand}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-7">
          {!selected ? (
            <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center text-sm text-slate-500">
              اختر نطاقاً من القائمة لعرض تفاصيله وتوليد مشروع كامل منه.
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-100">{selected.labelAr}</h2>
                <span className="font-mono text-[10px] text-slate-500">{selected.id}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{selected.descriptionAr}</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.map((t) => (
                  <span key={t} className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{t}</span>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-slate-400">
                  عنوان المشروع
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  وصف المتطلبات
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
                >
                  {generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Code2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {generating ? 'جارٍ التوليد والتحقق...' : 'ولّد المشروع وتحقق منه'}
                </button>
                {result && (
                  <button
                    type="button"
                    onClick={() => void onPromoteToProject(selected, title || selected.labelAr, prompt || selected.descriptionAr)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    أضف إلى خط الإنتاج
                  </button>
                )}
              </div>

              {genError && (
                <div className="flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/30 px-2.5 py-2 text-[11px] text-rose-300">
                  <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> {genError}
                </div>
              )}

              {result && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      تحقق: {result.verification.testsPassed}/{result.verification.testsExecuted} اختبار ناجح
                    </span>
                    <span className="text-slate-400">المشغّل: {result.verification.runtime}</span>
                    <span className="text-slate-400" dir="ltr">الملفات: {Object.keys(result.files).length}</span>
                  </div>
                  {result.verification.exitCode !== 0 && (
                    <p className="mt-2 text-[11px] text-amber-300">ملاحظة: بعض الاختبارات لم تنجح — راجع سجل التحقق.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.keys(result.files).map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        <FileCode2 className="h-3 w-3" aria-hidden="true" />{f}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <TestTube2 className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                    <span dir="ltr">{result.testCommand}</span>
                  </div>
                  <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-[10px] leading-relaxed text-slate-400">
                    {result.verification.outputSnippet || 'لا يوجد سجل تنفيذ (لم يتوفر مشغّل مناسب).'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
