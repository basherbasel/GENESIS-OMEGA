import React, { useMemo } from 'react';
import { Activity, BarChart3, Cpu, Gauge, ShieldCheck } from 'lucide-react';
import { computeDashboardMetrics } from '../lib/dashboard_metrics';
import { t, type Language } from '../lib/i18n';
import type { GovernorStats, ModelRoutingConfig, ProjectRecord } from '../lib/types';

interface DashboardViewProps {
  projects: ProjectRecord[];
  governor: GovernorStats | null;
  activeRouting: ModelRoutingConfig | null;
  language: Language;
}

const StatCard: React.FC<{ label: string; value: string | number; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-semibold text-cyan-300" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({ projects, governor, activeRouting, language }) => {
  const m = useMemo(() => computeDashboardMetrics(projects), [projects]);
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

  return (
    <main dir={language === 'ar' ? 'rtl' : 'ltr'} className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <BarChart3 className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          {tr('dash.title')}
        </h1>
        <p className="text-xs text-slate-400">
          {tr('dash.subtitle')}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label={tr('dash.aria')}>
        <StatCard label={tr('dash.projects')} value={m.total} hint={tr('dash.projectsHint')} />
        <StatCard label={tr('dash.verified')} value={m.verified} hint={tr('dash.reviewHint', { n: m.needsReview })} />
        <StatCard label={tr('dash.avgScore')} value={`${m.averageScore}/100`} />
        <StatCard label={tr('dash.tests')} value={m.totalTests} hint={tr('dash.testsHint')} />
        <StatCard label={tr('dash.redTeam')} value={m.redTeamSurvived} />
        <StatCard label={tr('dash.maxRps')} value={m.benchmarks.length ? Math.max(...m.benchmarks.map((b) => b.rps)) : '—'} hint={tr('dash.rpsHint')} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <Activity className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            {tr('dash.scores')}
          </h2>
          {m.scoreBars.length === 0 ? (
            <p className="text-xs text-slate-500">{tr('dash.noProjects')}</p>
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
            {tr('dash.host')}
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-slate-500">{tr('dash.os')}</dt><dd className="text-slate-200">{governor?.os || '—'}</dd>
            <dt className="text-slate-500">{tr('dash.cores')}</dt><dd className="text-slate-200">{governor?.cpuCores ?? '—'}</dd>
            <dt className="text-slate-500">{tr('dash.memory')}</dt><dd className="text-slate-200">{governor?.availableRamGb ?? '—'} GB</dd>
            <dt className="text-slate-500">{tr('dash.profile')}</dt><dd className="text-slate-200">{governor?.profile || '—'}</dd>
            <dt className="text-slate-500">{tr('dash.architect')}</dt><dd className="font-mono text-[11px] text-slate-300">{activeRouting?.architect || '—'}</dd>
            <dt className="text-slate-500">{tr('dash.builder')}</dt><dd className="font-mono text-[11px] text-slate-300">{activeRouting?.builder_alpha || '—'}</dd>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">{tr('dash.ecosystems')}</h2>
          <div className="flex flex-wrap gap-2">
            {m.byEcosystem.length === 0 && <span className="text-xs text-slate-500">{tr('dash.noData')}</span>}
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
            {tr('dash.benchmark')}
          </h2>
          {m.benchmarks.length === 0 ? (
            <p className="text-xs text-slate-500">{tr('dash.noBenchmark')}</p>
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
            {tr('dash.healing')}
          </h2>
          {m.healing.length === 0 ? (
            <p className="text-xs text-slate-500">{tr('dash.noHealing')}</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-300">
              {m.healing.slice(0, 4).map((h) => (
                <li key={h.projectId}>
                  #{h.projectId}: {h.status} · {h.attempts} {tr('dash.patches')} · {h.initialScore}→{h.finalScore}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
};
