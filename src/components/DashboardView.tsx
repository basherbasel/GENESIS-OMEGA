import React, { useMemo } from 'react';
import { Activity, BarChart3, Cpu, Gauge, ShieldCheck } from 'lucide-react';
import { computeDashboardMetrics } from '../lib/dashboard_metrics';
import type { GovernorStats, ModelRoutingConfig, ProjectRecord } from '../lib/types';

interface DashboardViewProps {
  projects: ProjectRecord[];
  governor: GovernorStats | null;
  activeRouting: ModelRoutingConfig | null;
}

const StatCard: React.FC<{ label: string; value: string | number; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-semibold text-cyan-300" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({ projects, governor, activeRouting }) => {
  const m = useMemo(() => computeDashboardMetrics(projects), [projects]);

  return (
    <main dir="rtl" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <BarChart3 className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          لوحة القياسات
        </h1>
        <p className="text-xs text-slate-400">
          كل الأرقام مشتقة من الحالة الحقيقية في المتجر — لا قيم مُقدَّرة ولا إحصاءات مُختلقة.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="مؤشرات أساسية">
        <StatCard label="المشاريع" value={m.total} hint="المخزون الكلي" />
        <StatCard label="مُتحقّق" value={m.verified} hint={`يحتاج مراجعة: ${m.needsReview}`} />
        <StatCard label="متوسط الجودة" value={`${m.averageScore}/100`} />
        <StatCard label="الاختبارات المنفذة" value={m.totalTests} hint="عدّها المتحقق فعلياً" />
        <StatCard label="صامد Red-Team" value={m.redTeamSurvived} />
        <StatCard label="أقصى RPS" value={m.benchmarks.length ? Math.max(...m.benchmarks.map((b) => b.rps)) : '—'} hint="قياس HTTP حقيقي" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <Activity className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            درجات المشاريع
          </h2>
          {m.scoreBars.length === 0 ? (
            <p className="text-xs text-slate-500">لا توجد مشاريع بعد.</p>
          ) : (
            <div className="space-y-2">
              {m.scoreBars.map((bar) => (
                <div key={bar.id} className="space-y-1">
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="truncate text-slate-300">#{bar.id} {bar.title}</span>
                    <span className={bar.status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>{bar.score}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                    <div
                      className={bar.status === 'verified' ? 'h-full rounded bg-emerald-500' : 'h-full rounded bg-amber-500'}
                      style={{ width: `${Math.max(0, Math.min(100, bar.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <Cpu className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            حالة المضيف والتوجيه
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-slate-500">النظام</dt><dd className="text-slate-200">{governor?.os || '—'}</dd>
            <dt className="text-slate-500">الأنوية</dt><dd className="text-slate-200">{governor?.cpuCores ?? '—'}</dd>
            <dt className="text-slate-500">الذاكرة المتاحة</dt><dd className="text-slate-200">{governor?.availableRamGb ?? '—'} GB</dd>
            <dt className="text-slate-500">الملف المعرفي</dt><dd className="text-slate-200">{governor?.profile || '—'}</dd>
            <dt className="text-slate-500">المعماري</dt><dd className="font-mono text-[11px] text-slate-300">{activeRouting?.architect || '—'}</dd>
            <dt className="text-slate-500">البنّاء</dt><dd className="font-mono text-[11px] text-slate-300">{activeRouting?.builder_alpha || '—'}</dd>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">توزيع البيئات</h2>
          <div className="flex flex-wrap gap-2">
            {m.byEcosystem.length === 0 && <span className="text-xs text-slate-500">لا بيانات</span>}
            {m.byEcosystem.map((e) => (
              <span key={e.key} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                {e.key}: {e.count}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <Gauge className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            القياس الحقيقي
          </h2>
          {m.benchmarks.length === 0 ? (
            <p className="text-xs text-slate-500">لم يُقَس أي أداء بعد.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-300">
              {m.benchmarks.slice(0, 4).map((b) => (
                <li key={`${b.projectId}-${b.measuredAt}`}>
                  #{b.projectId}: {b.rps} RPS · p95={b.p95LatencyMs}ms · {b.successCount}/{b.totalRequests}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <ShieldCheck className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            الإصلاح الذاتي
          </h2>
          {m.healing.length === 0 ? (
            <p className="text-xs text-slate-500">لا دورات إصلاح مسجّلة.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-300">
              {m.healing.slice(0, 4).map((h) => (
                <li key={h.projectId}>
                  #{h.projectId}: {h.status} · {h.attempts} ترقيع · {h.initialScore}→{h.finalScore}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
};
