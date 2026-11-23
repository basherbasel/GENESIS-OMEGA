import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Play, ShieldCheck } from 'lucide-react';
import { t, type Language } from '../lib/i18n';

interface Department {
  id: string;
  labelAr: string;
  labelEn: string;
  brainRole: string;
  rules: string[];
  verificationGates: string[];
}

interface WorkOrder {
  id: string;
  title: string;
  stage: string;
  departmentIds: string[];
  finalScore?: number;
  testsRun?: number;
  errorCode?: string;
  errorDetail?: string;
  blueprint?: string;
  createdAt: string;
}

interface IngestSnapshot {
  score: number;
  testsPassed: number;
  testsExecuted: number;
  secrets: number;
}

interface IngestRun {
  id: string;
  kind: 'audit' | 'evolve';
  repoPath: string;
  mode?: string;
  status: string;
  errorCode?: string;
  errorDetail?: string;
  fileCount: number;
  ecosystems: string[];
  baseline?: IngestSnapshot;
  final?: IngestSnapshot;
  changedFiles: string[];
  at: string;
}

interface IngestStageEvent {
  runId: string;
  stage: string;
  detail: string;
  at: string;
  errorCode?: string;
}

const TERMINAL_INGEST_STAGES = new Set(['PROMOTED', 'FAILED_CLOSED', 'NO_CHANGES']);

interface EnterpriseViewProps {
  language: Language;
}

export const EnterpriseView: React.FC<EnterpriseViewProps> = ({ language }) => {
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repoPath, setRepoPath] = useState('');
  const [mode, setMode] = useState<'harden-only' | 'develop-feature' | 'full-evolve'>('harden-only');
  const [goal, setGoal] = useState('');
  const [ingestBusy, setIngestBusy] = useState(false);
  const [runs, setRuns] = useState<IngestRun[]>([]);
  const [stages, setStages] = useState<IngestStageEvent[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [depRes, orderRes, runRes] = await Promise.all([
        fetch('/api/enterprise/departments'),
        fetch('/api/enterprise/work-orders'),
        fetch('/api/enterprise/ingest/runs'),
      ]);
      if (depRes.ok) setDepartments(((await depRes.json()) as { departments: Department[] }).departments);
      if (orderRes.ok) setOrders(((await orderRes.json()) as { workOrders: WorkOrder[] }).workOrders);
      if (runRes.ok) setRuns(((await runRes.json()) as { runs: IngestRun[] }).runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const source = new EventSource('/api/events');
    source.addEventListener('work_order', () => void refresh());
    source.addEventListener('ingest', (message) => {
      try {
        const frame = JSON.parse((message as MessageEvent).data) as { payload?: IngestStageEvent };
        const stage = frame.payload;
        if (!stage?.stage) return;
        setStages((previous) => [stage, ...previous].slice(0, 20));
        if (TERMINAL_INGEST_STAGES.has(stage.stage)) void refresh();
      } catch {
        // A malformed frame must not break the stream.
      }
    });
    return () => source.close();
  }, [refresh]);

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2 || problem.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/enterprise/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), problemStatement: problem.trim(), targetLang: targetLang.trim() || undefined, run: true }),
      });
      const data = (await response.json()) as { workOrder?: WorkOrder; error?: string };
      if (!response.ok || !data.workOrder) throw new Error(data.error || 'create failed');
      setTitle('');
      setProblem('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    } finally {
      setBusy(false);
    }
  };

  const runOrder = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/enterprise/work-orders/${encodeURIComponent(id)}/run`, { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const runIngest = async (kind: 'audit' | 'evolve') => {
    const pathValue = repoPath.trim();
    if (pathValue.length < 2) {
      setError(tr('ent.ingestPath'));
      return;
    }
    if (kind === 'evolve' && mode === 'develop-feature' && goal.trim().length < 3) {
      setError(tr('ent.ingestGoal'));
      return;
    }
    setIngestBusy(true);
    setError(null);
    try {
      const response = await fetch(kind === 'audit' ? '/api/enterprise/ingest' : '/api/enterprise/ingest/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathValue, mode, goal: goal.trim() || undefined }),
      });
      const data = (await response.json()) as {
        code?: string;
        error?: string;
        outcome?: { status: string; errorCode?: string; errorDetail?: string };
      };
      if (!response.ok) throw new Error(`${data.code ? `${data.code}: ` : ''}${data.error || 'ingest failed'}`);
      const outcome = data.outcome;
      if (outcome && outcome.status !== 'promoted' && outcome.status !== 'no_changes') {
        throw new Error(`${outcome.errorCode || outcome.status}${outcome.errorDetail ? `: ${outcome.errorDetail}` : ''}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ingest failed');
    } finally {
      setIngestBusy(false);
    }
  };

  return (
    <main dir={language === 'ar' ? 'rtl' : 'ltr'} className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Building2 className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          {tr('ent.title')}
        </h1>
        <p className="text-xs text-slate-400">{tr('ent.subtitle')}</p>
      </header>

      {error && <p className="rounded border border-rose-700 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</p>}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">{tr('ent.newOrder')}</h2>
          <form onSubmit={createOrder} className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('ent.titleField')}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder={tr('ent.problemField')}
              rows={4}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
            <input
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              placeholder={tr('ent.targetLang')}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {tr('ent.create')}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">{tr('ent.departments')}</h2>
          <div className="space-y-2">
            {departments.map((dep) => (
              <div key={dep.id} className="rounded border border-slate-800 px-2 py-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-200">{language === 'ar' ? dep.labelAr : dep.labelEn}</span>
                  <span className="font-mono text-cyan-400">{dep.brainRole}</span>
                </div>
                <div className="text-slate-500">{tr('ent.contracts')}: {dep.rules.slice(0, 2).join(' · ')}</div>
                <div className="text-slate-500">{tr('ent.gates')}: {dep.verificationGates.slice(0, 2).join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-200">{tr('ent.workOrders')}</h2>
        {orders.length === 0 ? (
          <p className="text-xs text-slate-500">{tr('ent.noOrders')}</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded border border-slate-800 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">{order.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-cyan-400">{tr('ent.stage')}: {order.stage}</span>
                    {order.stage === 'BACKLOG' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runOrder(order.id)}
                        className="inline-flex items-center gap-1 rounded border border-cyan-700 px-2 py-1 text-[11px] text-cyan-200"
                      >
                        <Play className="h-3 w-3" aria-hidden="true" /> {tr('ent.run')}
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {tr('ent.activeDeps')}: {order.departmentIds.join(', ')}
                  {order.finalScore !== undefined && ` · ${tr('ent.score')}: ${order.finalScore}`}
                  {order.testsRun !== undefined && ` · ${tr('ent.tests')}: ${order.testsRun}`}
                </div>
                {order.errorCode && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {tr('ent.error')}: {order.errorCode} — {order.errorDetail}
                  </div>
                )}
                {order.blueprint && <p className="mt-1 text-[11px] text-slate-400">{order.blueprint.slice(0, 200)}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4" aria-label={tr('ent.ingest')}>
        <h2 className="mb-1 text-sm font-medium text-slate-200">{tr('ent.ingest')}</h2>
        <p className="mb-3 text-[11px] text-slate-500">{tr('ent.ingestHint')}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder={tr('ent.ingestPath')}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                aria-label={tr('ent.ingestMode')}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="harden-only">{tr('ent.mode.harden')}</option>
                <option value="develop-feature">{tr('ent.mode.feature')}</option>
                <option value="full-evolve">{tr('ent.mode.full')}</option>
              </select>
              <button
                type="button"
                disabled={ingestBusy}
                onClick={() => void runIngest('audit')}
                className="rounded border border-cyan-700 px-3 py-1.5 text-xs text-cyan-200 disabled:opacity-50"
              >
                {tr('ent.ingestAudit')}
              </button>
              <button
                type="button"
                disabled={ingestBusy}
                onClick={() => void runIngest('evolve')}
                className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                {tr('ent.ingestEvolve')}
              </button>
            </div>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={tr('ent.ingestGoal')}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
            <div>
              <h3 className="mb-1 text-[11px] font-medium text-slate-300">{tr('ent.ingestStages')}</h3>
              {stages.length === 0 ? (
                <p className="text-[11px] text-slate-500">{tr('ent.ingestNoStages')}</p>
              ) : (
                <div className="space-y-1">
                  {stages.map((stage) => (
                    <div
                      key={`${stage.runId}-${stage.at}-${stage.stage}`}
                      className={`rounded border px-2 py-1 font-mono text-[11px] ${
                        stage.stage === 'FAILED_CLOSED'
                          ? 'border-rose-800 bg-rose-950/40 text-rose-300'
                          : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      {stage.stage} — {stage.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-[11px] font-medium text-slate-300">{tr('ent.ingestRuns')}</h3>
            {runs.length === 0 ? (
              <p className="text-[11px] text-slate-500">{tr('ent.ingestNoRuns')}</p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.id} className="rounded border border-slate-800 px-3 py-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-cyan-400">{run.kind}{run.mode ? ` · ${run.mode}` : ''}</span>
                      <span className={run.status === 'failed_closed' ? 'text-rose-400' : 'text-emerald-400'}>
                        {tr('ent.ingestStatus')}: {run.status}
                      </span>
                    </div>
                    <div className="mt-1 break-all text-slate-500">{run.repoPath}</div>
                    <div className="mt-1 text-slate-400">
                      {tr('ent.score')}: {run.baseline?.score ?? '—'}
                      {run.final ? ` → ${run.final.score}` : ''}
                      {' · '}
                      {tr('ent.tests')}: {run.final?.testsPassed ?? run.baseline?.testsPassed ?? 0}/
                      {run.final?.testsExecuted ?? run.baseline?.testsExecuted ?? 0}
                      {run.changedFiles.length > 0 && ` · ${tr('ent.ingestChanged')}: ${run.changedFiles.length}`}
                    </div>
                    {run.errorCode && (
                      <div className="mt-1 text-rose-400">
                        {tr('ent.error')}: {run.errorCode} — {run.errorDetail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};
