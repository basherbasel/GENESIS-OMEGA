import { t, type Language } from '../lib/i18n';
import React, { useState } from 'react';
import { CheckCircle2, Download, GitBranch, Package, Rocket, X } from 'lucide-react';
import type { ExportBundleManifest, GitDeployResult, ProjectRecord } from '../lib/types';

interface ExportModalProps {
  language: Language;
  project: ProjectRecord;
  onClose: () => void;
  onProjectUpdated: () => Promise<void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  onClose,
  onProjectUpdated,

  language,}) => {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

  const [mode, setMode] = useState<'local_bundle' | 'git_deploy'>('local_bundle');
  const [remoteUrl, setRemoteUrl] = useState('https://github.com/genesis-omega/service-release.git');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState(`chore: export verified build #${project.id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ExportBundleManifest | null>(null);
  const [executeDeploy, setExecuteDeploy] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [deployResult, setDeployResult] = useState<GitDeployResult | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDeployResult(null);
    setBusy(true);
    const payload =
      mode === 'git_deploy'
        ? {
            mode,
            remoteUrl: remoteUrl.trim(),
            branch: branch.trim(),
            commitMessage: commitMessage.trim(),
          }
        : { mode };
    try {
      const shouldDeploy = mode === 'git_deploy' && executeDeploy;
      const resp = await fetch(
        shouldDeploy
          ? `/api/projects/${project.id}/deploy`
          : `/api/projects/${project.id}/export/bundle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shouldDeploy ? { ...payload, dryRun } : payload),
        },
      );
      const data = (await resp.json()) as {
        manifest?: ExportBundleManifest;
        deployment?: { result: GitDeployResult };
        error?: string;
      };
      if (!resp.ok || !data.manifest) {
        setError(data.error || tr('exp.prepareError'));
        return;
      }
      setManifest(data.manifest);
      if (data.deployment) setDeployResult(data.deployment.result);
      await onProjectUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('exp.connectError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 id="export-modal-title" className="text-base font-bold text-slate-100">
              {tr('exp.titleWith', { title: project.title })}
            </h2>
            <p className="text-xs text-slate-400">
              {tr('exp.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('exp.close')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-1 w-fit">
          <button
            type="button"
            onClick={() => {
              setMode('local_bundle');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
              mode === 'local_bundle' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('exp.localManifest')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('git_deploy');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
              mode === 'git_deploy' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('exp.gitDeploy')}</span>
          </button>
        </div>

        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-3">
          {mode === 'git_deploy' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="export-remote-url" className="block text-xs text-slate-300 mb-1">
                  {tr('exp.remoteUrl')}
                </label>
                <input
                  id="export-remote-url"
                  dir="ltr"
                  type="text"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="export-branch" className="block text-xs text-slate-300 mb-1">
                  {tr('exp.branch')}
                </label>
                <input
                  id="export-branch"
                  dir="ltr"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="export-commit" className="block text-xs text-slate-300 mb-1">
                  {tr('exp.commitMessage')}
                </label>
                <input
                  id="export-commit"
                  dir="ltr"
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'git_deploy' && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={executeDeploy}
                  onChange={(e) => setExecuteDeploy(e.target.checked)}
                  className="mt-0.5 accent-cyan-500"
                />
                <span>
                  {tr('exp.executePush')}
                  <span className="block text-[11px] text-amber-300/80">
                    {tr('exp.pushWarning')}
                  </span>
                </span>
              </label>
              {executeDeploy && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="accent-cyan-500"
                  />
                  <span>{tr('exp.dryRun')}</span>
                </label>
              )}
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
            >
              {busy
                ? tr('exp.busy')
                : mode === 'local_bundle'
                  ? tr('exp.generateBundle')
                  : executeDeploy
                    ? dryRun
                      ? tr('exp.previewDeploy')
                      : tr('exp.realDeploy')
                    : tr('exp.generateScript')}
            </button>

            <a
              href={`/api/projects/${project.id}/download`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('exp.downloadZip')}</span>
            </a>
          </div>
        </form>

        {manifest && (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>{tr('exp.manifestReady')}</span>
              </div>
              <span className="font-mono text-slate-400 tabular-nums">
                {tr('exp.fileCount', { n: manifest.fileCount, kb: (manifest.totalBytes / 1024).toFixed(1) })}
              </span>
            </div>

            {manifest.exportedDir && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs">
                <span className="text-slate-400">{tr('exp.savedAt')}</span>
                <span dir="ltr" className="font-mono text-cyan-300">
                  {manifest.exportedDir}
                  {manifest.gitInitialized ? ' (Git initialized)' : ''}
                </span>
              </div>
            )}

            {manifest.deployScript ? (
              <pre dir="ltr" className="max-h-44 overflow-auto rounded border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-sky-300">
                {manifest.deployScript}
              </pre>
            ) : (
              <div className="max-h-44 overflow-auto rounded border border-slate-800">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">{tr('exp.path')}</th>
                      <th className="px-3 py-1.5 font-medium">{tr('exp.size')}</th>
                      <th className="px-3 py-1.5 font-medium">SHA-256</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {manifest.filesSummary.map((f) => (
                      <tr key={f.path}>
                        <td dir="ltr" className="px-3 py-1.5 font-mono text-slate-200 text-left">
                          {f.path}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-slate-400 tabular-nums">{f.sizeBytes} B</td>
                        <td dir="ltr" className="px-3 py-1.5 font-mono text-slate-500 text-left">
                          {f.sha256.slice(0, 14)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {deployResult && (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className={`inline-flex items-center gap-1.5 font-semibold ${deployResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                <Rocket className="h-4 w-4" aria-hidden="true" />
                <span>
                  {deployResult.success
                    ? deployResult.dryRun
                      ? tr('exp.previewDone')
                      : tr('exp.pushDone')
                    : tr('exp.pushFailed')}
                </span>
              </div>
              <span className="font-mono text-slate-400">{deployResult.steps.length} {tr('exp.commandsRun')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500">Commit</div>
                <div dir="ltr" className="font-mono text-cyan-300">{(deployResult.commitHash || '—').slice(0, 12)}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500">{tr('exp.branchShort')}</div>
                <div dir="ltr" className="font-mono text-slate-200">{deployResult.branch}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500">Push</div>
                <div className="font-mono text-slate-200">{deployResult.pushed ? tr('exp.yes') : deployResult.dryRun ? tr('exp.preview') : tr('exp.no')}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500">{tr('exp.remoteShort')}</div>
                <div dir="ltr" className="truncate font-mono text-slate-200">{deployResult.remote}</div>
              </div>
            </div>
            {deployResult.error && <p className="text-xs text-rose-300">{deployResult.error}</p>}
            <pre dir="ltr" className="max-h-40 overflow-auto rounded border border-slate-800 bg-slate-900 p-3 font-mono text-[11px] text-slate-400">
              {deployResult.steps
                .map((s) => `${s.ok ? '✓' : '✗'} ${s.cmd}\n  ${s.output || '(no output)'}`)
                .join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
