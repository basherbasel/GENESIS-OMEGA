import { t, type Language } from '../lib/i18n';
import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Container,
  Download,
  ExternalLink,
  FileDiff,
  FileText,
  FolderGit2,
  Gauge,
  HeartPulse,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { ECOSYSTEM_CATALOG, PROJECT_TEMPLATES } from '../lib/ecosystems';
import { AGENT_ROLE_LABELS, type ModelOption } from '../lib/routing';
import type {
  AgentRole,
  DetailTab,
  EcosystemKey,
  ModelRoutingConfig,
  ProjectRecord,
} from '../lib/types';
import { ExportModal } from './ExportModal';

interface StudioViewProps {
  language: Language;
  projects: ProjectRecord[];
  activeProjectId: number | null;
  activeTab: DetailTab;
  showCreateForm: boolean;
  defaultRouting: ModelRoutingConfig | null;
  availableModels: ModelOption[];
  onSelectProject: (id: number) => void;
  onSelectTab: (tab: DetailTab) => void;
  onToggleCreateForm: (open: boolean) => void;
  onCreateProject: (payload: {
    title: string;
    prompt: string;
    ecosystem?: EcosystemKey;
    modelOverrides?: Partial<Record<AgentRole, string>>;
    useAi?: boolean;
  }) => Promise<void>;
  onUploadZipProject: (payload: {
    title: string;
    prompt: string;
    zipBase64: string;
    modelOverrides?: Partial<Record<AgentRole, string>>;
  }) => Promise<void>;
  onStartSandbox: (id: number) => Promise<void>;
  onStopSandbox: (id: number) => Promise<void>;
  onRunBenchmark: (id: number) => Promise<void>;
  onRetryProject: (id: number) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onSaveProjectFile: (id: number, filePath: string, content: string) => Promise<void>;
  onVerifyProject: (id: number) => Promise<void>;
  onHealProject: (id: number) => Promise<string>;
  onAiSynthesize: (id: number) => Promise<void>;
  onRefreshProjects: () => Promise<void>;
}



export const StudioView: React.FC<StudioViewProps> = ({
  projects,
  activeProjectId,
  activeTab,
  showCreateForm,
  defaultRouting,
  availableModels,
  onSelectProject,
  onSelectTab,
  onToggleCreateForm,
  onCreateProject,
  onUploadZipProject,
  onStartSandbox,
  onStopSandbox,
  onRunBenchmark,
  onRetryProject,
  onDeleteProject,
  onSaveProjectFile,
  onVerifyProject,
  onHealProject,
  onAiSynthesize,
  onRefreshProjects,

  language,}) => {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

const PIPELINE_STAGES = [
  tr('st.stage1'),
  tr('st.stage2'),
  tr('st.stage3'),
  tr('st.stage4'),
  tr('st.stage5'),
  tr('st.stage6'),
];

const DETAIL_TABS: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
  { id: 'logs', label: tr('st.tabLogs'), icon: <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'sandbox', label: tr('st.tabSandbox'), icon: <Play className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'benchmark', label: tr('st.tabPerf'), icon: <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'sbom', label: tr('st.tabSbom'), icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'diagrams', label: tr('st.tabDiagrams'), icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'docker', label: tr('st.tabDocker'), icon: <Container className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'files', label: tr('st.tabFiles'), icon: <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'diffs', label: tr('st.tabDiffs'), icon: <FileDiff className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'report', label: tr('st.tabReport'), icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'healing', label: tr('st.tabHealing'), icon: <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" /> },
];

  const [submitMode, setSubmitMode] = useState<'new' | 'audit'>('new');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [ecosystem, setEcosystem] = useState<string>('auto');
  const [zipBase64, setZipBase64] = useState<string>('');
  const [zipFilename, setZipFilename] = useState<string>('');
  const [showRoutingPanel, setShowRoutingPanel] = useState(false);
  const [modelOverrides, setModelOverrides] = useState<Partial<Record<AgentRole, string>>>({});
  const [useNeural, setUseNeural] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string>('');
  const [editingFile, setEditingFile] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [fileSaveNote, setFileSaveNote] = useState<string | null>(null);
  const [headerNotice, setHeaderNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dockerSubTab, setDockerSubTab] = useState<string>('Dockerfile');
  const [diagramView, setDiagramView] = useState<'visual' | 'mermaid'>('visual');
  const [probeResult, setProbeResult] = useState<{
    endpoint: string;
    method?: string;
    status: number;
    latencyMs: number;
    liveProcess?: boolean;
    port?: number;
    body: unknown;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId],
  );

  const fileNames = useMemo(
    () => (activeProject ? Object.keys(activeProject.files).sort() : []),
    [activeProject],
  );

  const currentFileName =
    selectedFile && activeProject?.files[selectedFile] !== undefined
      ? selectedFile
      : fileNames[0] || '';

  const dockerFiles = useMemo(() => {
    if (!activeProject) return [];
    return Object.keys(activeProject.files).filter(
      (f) =>
        f === 'Dockerfile' ||
        f === 'docker-compose.yml' ||
        f === '.dockerignore' ||
        f === 'Makefile' ||
        f === 'run.sh' ||
        f === 'run.bat' ||
        f.endsWith('.service'),
    );
  }, [activeProject]);

  const activeDockerFile = dockerFiles.includes(dockerSubTab)
    ? dockerSubTab
    : dockerFiles[0] || 'Dockerfile';

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipFilename(file.name);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.zip$/i, ''));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setZipBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (submitMode === 'new') {
      if (title.trim().length < 2 || prompt.trim().length < 5) {
        setFormError(tr('st.needFields'));
        return;
      }
      setSubmitting(true);
      try {
        await onCreateProject({
          title: title.trim(),
          prompt: prompt.trim(),
          ecosystem: ecosystem === 'auto' ? undefined : (ecosystem as EcosystemKey),
          modelOverrides: Object.keys(modelOverrides).length > 0 ? modelOverrides : undefined,
          useAi: useNeural,
        });
        setTitle('');
        setPrompt('');
        onToggleCreateForm(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : tr('st.buildError'));
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!zipBase64) {
        setFormError(tr('st.needZip'));
        return;
      }
      setSubmitting(true);
      try {
        await onUploadZipProject({
          title: title.trim() || zipFilename || tr('st.auditedZip'),
          prompt: prompt.trim() || tr('st.auditPrompt'),
          zipBase64,
          modelOverrides: Object.keys(modelOverrides).length > 0 ? modelOverrides : undefined,
        });
        setTitle('');
        setPrompt('');
        setZipBase64('');
        setZipFilename('');
        onToggleCreateForm(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : tr('st.zipError'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const primaryApiGetPath = useMemo(() => {
    const eps = activeProject?.discoveredEndpoints || [];
    const domainSpecific = eps.find(
      (e) => e.method === 'GET' && e.path.startsWith('/api/') && e.path !== '/api/items',
    );
    if (domainSpecific) return domainSpecific.path;
    const found = eps.find((e) => e.method === 'GET' && e.path.startsWith('/api/'));
    return found?.path || '/api/items';
  }, [activeProject]);

  const runProbe = async (projectId: number, suffix: string) => {
    setActionBusy('probe');
    try {
      const resp = await fetch(`/api/projects/${projectId}/sandbox/probe?path=${encodeURIComponent(suffix)}`);
      const data = await resp.json();
      if (resp.ok) {
        setProbeResult({ ...data, method: 'GET' });
      }
    } finally {
      setActionBusy(null);
    }
  };

  const runMockProbe = async (projectId: number, method: string, epPath: string) => {
    setActionBusy('mock-probe');
    try {
      const resp = await fetch(`/api/projects/${projectId}/sandbox/mock-probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, path: epPath }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setProbeResult(data);
      }
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sidebar Column: Queue & New Project / Audit Drawer (4 cols) */}
        <aside className="lg:col-span-4 space-y-4">
          {showCreateForm && (
            <section
              aria-label={tr('st.formAria')}
              className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setSubmitMode('new')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      submitMode === 'new' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tr('st.newBuild')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmitMode('audit')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      submitMode === 'audit' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tr('st.auditZip')}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleCreateForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {tr('st.close')}
                </button>
              </div>

              {submitMode === 'new' && (
                <div>
                  <label htmlFor="template-select" className="block text-xs text-slate-400 mb-1">
                    {tr('st.templates')}
                  </label>
                  <select
                    id="template-select"
                    value=""
                    onChange={(e) => {
                      const tpl = PROJECT_TEMPLATES.find((t) => t.id === e.target.value);
                      if (tpl) {
                        setTitle(tpl.title);
                        setPrompt(tpl.prompt);
                        setEcosystem(tpl.ecosystem);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">{tr('st.chooseTemplate')}</option>
                    {PROJECT_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-3">
                <div>
                  <label htmlFor="proj-title" className="block text-xs text-slate-300 mb-1">
                    {tr('st.projectName')}
                  </label>
                  <input
                    id="proj-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={tr('st.namePlaceholder')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {submitMode === 'new' ? (
                  <div>
                    <label htmlFor="proj-eco" className="block text-xs text-slate-300 mb-1">
                      {tr('st.ecosystem')}
                    </label>
                    <select
                      id="proj-eco"
                      value={ecosystem}
                      onChange={(e) => setEcosystem(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="auto">{tr('st.autoDetect')}</option>
                      {Object.values(ECOSYSTEM_CATALOG).map((eco) => (
                        <option key={eco.key} value={eco.key}>
                          {eco.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="zip-upload" className="block text-xs text-slate-300 mb-1">
                      {tr('st.zipFile')}
                    </label>
                    <label
                      htmlFor="zip-upload"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950 px-3 py-4 text-xs text-slate-300 hover:border-cyan-500"
                    >
                      <Upload className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                      <span>{zipFilename || tr('st.zipPlaceholder')}</span>
                    </label>
                    <input
                      id="zip-upload"
                      type="file"
                      accept=".zip"
                      onChange={handleZipSelect}
                      className="sr-only"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="proj-prompt" className="block text-xs text-slate-300 mb-1">
                    {tr('st.specs')}
                  </label>
                  <textarea
                    id="proj-prompt"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={tr('st.specsPlaceholder')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Neural synthesis toggle — local Ollama or Gemini by role model */}
                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useNeural}
                    onChange={(e) => setUseNeural(e.target.checked)}
                    className="h-3.5 w-3.5 accent-cyan-500"
                  />
                  <span>{tr('st.neuralToggle')}</span>
                </label>

                {/* Collapsible Asymmetric Model Routing Selector */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/70">
                  <button
                    type="button"
                    aria-expanded={showRoutingPanel}
                    onClick={() => setShowRoutingPanel((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-300 hover:text-cyan-300 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                      <span>{tr('st.routing')}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {showRoutingPanel ? tr('st.hide') : tr('st.customizeRoles')}
                    </span>
                  </button>

                  {showRoutingPanel && (
                    <div className="border-t border-slate-800 p-3 space-y-2">
                      {(Object.keys(AGENT_ROLE_LABELS) as AgentRole[]).map((role) => {
                        const effectiveVal =
                          modelOverrides[role] || defaultRouting?.[role] || 'gemini-4-hydrogen';
                        return (
                          <div key={role} className="space-y-1">
                            <label htmlFor={`route-${role}`} className="block text-[11px] text-slate-400">
                              {AGENT_ROLE_LABELS[role].title}
                            </label>
                            <select
                              id={`route-${role}`}
                              dir="ltr"
                              value={effectiveVal}
                              onChange={(e) =>
                                setModelOverrides((prev) => ({ ...prev, [role]: e.target.value }))
                              }
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              {availableModels.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.installed ? '✓ ' : ''}{opt.id} — {opt.group === 'local' ? tr('st.local') : tr('st.cloud')} · {opt.tier}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      <p className="pt-1 text-[10px] leading-relaxed text-slate-500">
                        {tr('st.localHint')}
                      </p>
                    </div>
                  )}
                </div>

                {formError && <p className="text-xs text-rose-400">{formError}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? tr('st.launching')
                    : submitMode === 'new'
                      ? tr('st.launch')
                      : tr('st.startAudit')}
                </button>
              </form>
            </section>
          )}

          {/* Project Queue List */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">{tr('st.queue')}</h2>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {projects.length} {tr('st.projectsSuffix')}
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center">
                <FolderGit2 className="mx-auto h-7 w-7 text-slate-500 mb-2" aria-hidden="true" />
                <p className="text-xs text-slate-300">{tr('st.noProjects')}</p>
                <button
                  type="button"
                  onClick={() => onToggleCreateForm(true)}
                  className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                >
                  {tr('st.createFirst')}
                </button>
              </div>
            ) : (
              <ul className="space-y-2" data-testid="project-queue-list">
                {projects.map((proj) => {
                  const selected = activeProject?.id === proj.id;
                  return (
                    <li key={proj.id}>
                      <button
                        type="button"
                        onClick={() => onSelectProject(proj.id)}
                        className={`w-full text-right rounded-lg border p-3 transition-colors cursor-pointer ${
                          selected
                            ? 'border-cyan-500/70 bg-slate-950'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {proj.title}
                          </span>
                          <span className="font-mono text-xs font-semibold text-cyan-400 tabular-nums shrink-0">
                            {proj.score}/100
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span className={proj.status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>
                            {proj.status === 'verified' ? tr('st.verified') : tr('st.needsReview')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[180px]">{proj.ecosystemKey}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{proj.testsRun} {tr('st.testsSuffix')}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Detail Workspace (8 cols) */}
        <main className="lg:col-span-8 space-y-4">
          {!activeProject ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-sm text-slate-400">
              {tr('st.selectHint')}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
              {/* Project Header & Primary Operations */}
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-4">
                <div className="space-y-1.5 min-w-0">
                  <h1 className="text-lg font-bold text-slate-100" data-testid="active-project-title">
                    {activeProject.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                    <span className="font-mono text-slate-300">#{activeProject.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeProject.language}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-cyan-400 font-semibold">{tr('st.scoreWith', { score: activeProject.score })}</span>
                    <span aria-hidden="true">·</span>
                    <span className={activeProject.redTeamStatus === 'survived' ? 'text-emerald-400' : 'text-rose-400'}>
                      Red-Team: {activeProject.redTeamStatus === 'survived' ? tr('st.survived') : tr('st.breached')}
                    </span>
                    {activeProject.verification && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          dir="ltr"
                          className={
                            activeProject.verification.exitCode === 0 ? 'text-emerald-400 font-mono' : 'text-amber-300 font-mono'
                          }
                        >
                          {activeProject.verification.runtime}: {activeProject.verification.testsPassed}/{activeProject.verification.testsExecuted}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeProject.sandbox.running ? (
                    <button
                      type="button"
                      onClick={() => void onStopSandbox(activeProject.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 whitespace-nowrap cursor-pointer"
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('st.stopSandbox')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onStartSandbox(activeProject.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 whitespace-nowrap cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('st.startSandbox')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={actionBusy === 'bench'}
                    onClick={async () => {
                      setActionBusy('bench');
                      try {
                        await onRunBenchmark(activeProject.id);
                      } finally {
                        setActionBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/50 whitespace-nowrap cursor-pointer"
                  >
                    <Gauge className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                    <span>{actionBusy === 'bench' ? tr('st.benching') : tr('st.benchmark')}</span>
                  </button>

                  <a
                    href={`/api/projects/${activeProject.id}/download`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>ZIP</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/60 whitespace-nowrap cursor-pointer"
                  >
                    <Share2 className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                    <span>{tr('st.exportPublish')}</span>
                  </button>

                  <a
                    href={`/api/projects/${activeProject.id}/report/html`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('st.htmlReport')}</span>
                  </a>

                  <a
                    href={`/api/projects/${activeProject.id}/report/html?print=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-700 bg-slate-950 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-400 whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('st.savePdf')}</span>
                  </a>

                  <button
                    type="button"
                    disabled={actionBusy === 'verify'}
                    onClick={async () => {
                      setActionBusy('verify');
                      setHeaderNotice(null);
                      try {
                        await onVerifyProject(activeProject.id);
                        setHeaderNotice({ ok: true, text: tr('st.verifyOk') });
                      } catch (err) {
                        setHeaderNotice({ ok: false, text: err instanceof Error ? err.message : tr('st.verifyFail') });
                      } finally {
                        setActionBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-500/50 whitespace-nowrap cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{actionBusy === 'verify' ? tr('st.checking') : tr('st.realVerify')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionBusy === 'heal'}
                    onClick={async () => {
                      setActionBusy('heal');
                      setHeaderNotice(null);
                      try {
                        const summary = await onHealProject(activeProject.id);
                        setHeaderNotice({ ok: true, text: summary });
                        onSelectTab('healing');
                      } catch (err) {
                        setHeaderNotice({
                          ok: false,
                          text: err instanceof Error ? err.message : tr('st.healError'),
                        });
                      } finally {
                        setActionBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-400 whitespace-nowrap cursor-pointer"
                  >
                    <HeartPulse className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                    <span>{actionBusy === 'heal' ? tr('st.healingBusy') : tr('st.selfHeal')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionBusy === 'ai-synth'}
                    onClick={async () => {
                      setActionBusy('ai-synth');
                      setHeaderNotice(null);
                      try {
                        await onAiSynthesize(activeProject.id);
                        setHeaderNotice({ ok: true, text: tr('st.geminiOk') });
                      } catch (err) {
                        setHeaderNotice({
                          ok: false,
                          text: err instanceof Error ? err.message : tr('st.geminiError'),
                        });
                      } finally {
                        setActionBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:border-indigo-400 whitespace-nowrap cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                    <span>{actionBusy === 'ai-synth' ? tr('st.enhancing') : tr('st.geminiEnhance')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void onRetryProject(activeProject.id)}
                    aria-label={tr('st.retryAria')}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void onDeleteProject(activeProject.id)}
                    aria-label={tr('st.deleteAria', { title: activeProject.title })}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {headerNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    headerNotice.ok
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {headerNotice.text}
                </div>
              )}

              {/* 6-Stage Pipeline Tracker */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {PIPELINE_STAGES.map((stage, i) => {
                  const done = activeProject.status === 'verified' || i < 4;
                  return (
                    <div
                      key={stage}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs ${
                        done
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{stage}</span>
                    </div>
                  );
                })}
              </div>

              {/* 10 Detail Tabs */}
              <div
                role="tablist"
                aria-label={tr('st.detailsAria')}
                className="flex flex-wrap items-center gap-1 border-b border-slate-800 pb-2"
              >
                {DETAIL_TABS.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectTab(t.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-slate-800 text-cyan-300'
                          : 'text-slate-400 hover:bg-slate-950 hover:text-slate-200'
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Body */}
              {activeTab === 'logs' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-cyan-400">{tr('st.reasoning')}</h3>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300 font-sans">
                      {activeProject.reasoningBrief}
                    </pre>
                    {activeProject.routingUsed && (
                      <div className="border-t border-slate-800 pt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span className="text-slate-300 font-sans">{tr('st.modelsUsed')}</span>
                        <span dir="ltr">Architect: {activeProject.routingUsed.architect}</span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr">Builder: {activeProject.routingUsed.builder_alpha}</span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr">Red-Team: {activeProject.routingUsed.red_team}</span>
                      </div>
                    )}
                    {activeProject.rollbackSummary && (
                      <div className="text-[11px] text-slate-400">
                        {tr('st.rollback')} {' '}
                        <span className={activeProject.rollbackSummary.applied ? 'text-amber-300' : 'text-emerald-400'}>
                          {activeProject.rollbackSummary.reason}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-300 mb-2">{tr('st.liveLog')}</h3>
                    <pre
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-emerald-300/95 overflow-x-auto"
                    >
                      {activeProject.liveLogs}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'sandbox' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold text-slate-200">
                        {tr('st.sandboxState')} {' '}
                        <span className={activeProject.sandbox.running ? 'text-emerald-400' : 'text-slate-400'}>
                          {activeProject.sandbox.running ? tr('st.running') : tr('st.stopped')}
                        </span>
                        {activeProject.sandbox.running && activeProject.sandbox.port && (
                          <span dir="ltr" className="mr-2 font-mono text-cyan-300">
                            (Port {activeProject.sandbox.port})
                          </span>
                        )}
                      </div>
                      <div dir="ltr" className="font-mono text-slate-400">
                        Endpoint: /sandbox/{activeProject.id}/health
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void runProbe(activeProject.id, '/health')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-cyan-300 hover:border-cyan-500 cursor-pointer whitespace-nowrap"
                      >
                        <span>{tr('watch.scan')}</span>
                        <span dir="ltr" className="font-mono">/health</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void runProbe(activeProject.id, primaryApiGetPath)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-cyan-300 hover:border-cyan-500 cursor-pointer whitespace-nowrap"
                      >
                        <span>{tr('watch.scan')}</span>
                        <span dir="ltr" className="font-mono">{primaryApiGetPath}</span>
                      </button>
                      <a
                        href={`/api/projects/${activeProject.id}/swagger`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                        <span>Swagger / OpenAPI</span>
                      </a>
                      <a
                        href={`/sandbox/${activeProject.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-500 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        <span>{tr('st.appPreview')}</span>
                      </a>
                    </div>
                  </div>

                  {/* Discovered Endpoints & Live/Contract Tester */}
                  {activeProject.discoveredEndpoints && activeProject.discoveredEndpoints.length > 0 && (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">
                          {tr('st.endpoints')}
                        </span>
                        <span className="font-mono text-slate-400 tabular-nums">
                          {activeProject.discoveredEndpoints.length} {tr('st.routes')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {activeProject.discoveredEndpoints.map((ep) => (
                          <div
                            key={`${ep.method}-${ep.path}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div dir="ltr" className="font-mono text-cyan-300 truncate text-left">
                                {ep.method} {ep.path}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">{ep.summary}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void runMockProbe(activeProject.id, ep.method, ep.path)}
                              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-500 cursor-pointer shrink-0 whitespace-nowrap"
                            >
                              {activeProject.sandbox.running ? tr('st.liveTest') : tr('st.mockTest')}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {probeResult && (
                    <div
                      data-testid="sandbox-probe-result"
                      className="rounded-lg border border-cyan-500/40 bg-slate-950 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
                        <span dir="ltr">
                          {probeResult.method ? `${probeResult.method} ` : ''}
                          {probeResult.endpoint}
                          {probeResult.liveProcess ? ` · Live OS Port ${probeResult.port ?? ''}` : ' · Contract Fallback'}
                        </span>
                        <span className="text-emerald-400">
                          HTTP {probeResult.status} · {probeResult.latencyMs} ms
                        </span>
                      </div>
                      <pre dir="ltr" className="overflow-auto text-xs text-sky-300">
                        {JSON.stringify(probeResult.body, null, 2)}
                      </pre>
                    </div>
                  )}

                  <pre
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300"
                  >
                    {activeProject.sandbox.logs}
                  </pre>
                </div>
              )}

              {activeTab === 'benchmark' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">
                      {tr('st.benchHint')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void onRunBenchmark(activeProject.id)}
                      className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
                    >
                      {tr('st.runBenchmark')}
                    </button>
                  </div>

                  {!activeProject.benchmark ? (
                    <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
                      {tr('st.noBenchmark')}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="text-[11px] text-slate-400">RPS</div>
                          <div className="mt-1 font-mono text-lg font-bold text-cyan-400 tabular-nums">
                            {activeProject.benchmark.rps}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="text-[11px] text-slate-400">{tr('st.avgLatency')}</div>
                          <div className="mt-1 font-mono text-lg font-bold text-slate-100 tabular-nums">
                            {activeProject.benchmark.avgLatencyMs} ms
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="text-[11px] text-slate-400">P50</div>
                          <div className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
                            {activeProject.benchmark.p50LatencyMs} ms
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="text-[11px] text-slate-400">P95</div>
                          <div className="mt-1 font-mono text-lg font-bold text-amber-400 tabular-nums">
                            {activeProject.benchmark.p95LatencyMs} ms
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="text-[11px] text-slate-400">P99</div>
                          <div className="mt-1 font-mono text-lg font-bold text-slate-200 tabular-nums">
                            {activeProject.benchmark.p99LatencyMs} ms
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400 font-mono tabular-nums">
                        {tr('st.benchSummary', { total: activeProject.benchmark.totalRequests, ok: activeProject.benchmark.successCount, concurrency: activeProject.benchmark.concurrency, errors: activeProject.benchmark.errorCount })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sbom' && activeProject.sbom && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-100">
                        {tr('st.sbomTitle', { format: activeProject.sbom.bomFormat, version: activeProject.sbom.specVersion })}
                      </div>
                      <div className="text-slate-400 tabular-nums">
                        {tr('st.components', { n: activeProject.sbom.components.length })} · {tr('st.secrets', { n: activeProject.sbom.securityAudit.hardcodedSecretsDetected })}{' '}
                        {activeProject.sbom.securityAudit.hardcodedSecretsDetected}
                      </div>
                    </div>
                    <span
                      className={`font-semibold ${
                        activeProject.sbom.securityAudit.supplyChainStatus === 'clean'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {activeProject.sbom.securityAudit.supplyChainStatus === 'clean'
                        ? tr('st.cleanChain')
                        : tr('st.secretsWarning')}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">{tr('st.fileLibrary')}</th>
                          <th className="px-3 py-2 font-medium">{tr('st.type')}</th>
                          <th className="px-3 py-2 font-medium">{tr('exp.size')}</th>
                          <th className="px-3 py-2 font-medium">{tr('st.sha256')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                        {activeProject.sbom.components.map((comp) => (
                          <tr key={`${comp.type}-${comp.name}`} className="hover:bg-slate-900/60">
                            <td dir="ltr" className="px-3 py-2 font-mono text-slate-200 text-left">
                              {comp.name}
                            </td>
                            <td className="px-3 py-2 text-slate-400">{comp.type}</td>
                            <td className="px-3 py-2 font-mono text-slate-400 tabular-nums">
                              {comp.sizeBytes ? `${comp.sizeBytes} B` : '—'}
                            </td>
                            <td dir="ltr" className="px-3 py-2 font-mono text-slate-500 text-left">
                              {comp.hashes?.[0]?.content ? `${comp.hashes[0].content.slice(0, 16)}...` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'diagrams' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">
                      {tr('st.diagramsTitle')}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/sandbox/${activeProject.id}/diagrams`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-cyan-300 hover:border-cyan-500 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('st.openDiagrams')}</span>
                      </a>
                      <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-1">
                        <button
                          type="button"
                          onClick={() => setDiagramView('visual')}
                          className={`rounded px-2.5 py-1 text-xs cursor-pointer ${
                            diagramView === 'visual' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
                          }`}
                        >
                          {tr('st.visualView')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiagramView('mermaid')}
                          className={`rounded px-2.5 py-1 text-xs cursor-pointer ${
                            diagramView === 'mermaid' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
                          }`}
                        >
                          {tr('st.mermaidSource')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {diagramView === 'visual' ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Visual SVG ERD (isolated dir="ltr" so SVG text anchors correctly) */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                        <h4 className="text-xs font-semibold text-slate-300 mb-3">{tr('st.erd')}</h4>
                        <div dir="ltr">
                          <svg
                            viewBox="0 0 420 220"
                            className="w-full h-52"
                            role="img"
                            aria-label={tr('st.erdAria')}
                          >
                          {activeProject.diagrams.entities.slice(0, 2).map((ent, idx, arr) => {
                            const x = arr.length === 1 ? 124 : idx === 0 ? 18 : 230;
                            return (
                              <g key={ent.name}>
                                <rect
                                  x={x}
                                  y={20}
                                  width={172}
                                  height={170}
                                  rx={8}
                                  fill="#0f172a"
                                  stroke="#334155"
                                  strokeWidth={1.5}
                                />
                                <rect x={x} y={20} width={172} height={30} rx={8} fill="#164e63" />
                                <text
                                  x={x + 86}
                                  y={40}
                                  textAnchor="middle"
                                  fill="#ecfeff"
                                  fontSize="12"
                                  fontFamily="monospace"
                                >
                                  {ent.name.toUpperCase()}
                                </text>
                                {ent.fields.slice(0, 5).map((f, fIdx) => (
                                  <text
                                    key={f}
                                    x={x + 14}
                                    y={72 + fIdx * 22}
                                    textAnchor="start"
                                    fill="#cbd5e1"
                                    fontSize="11"
                                    fontFamily="monospace"
                                  >
                                    {`• ${f}`}
                                  </text>
                                ))}
                              </g>
                            );
                          })}
                          {activeProject.diagrams.entities.length >= 2 && (
                            <line
                              x1={190}
                              y1={105}
                              x2={230}
                              y2={105}
                              stroke="#22d3ee"
                              strokeWidth={2}
                              strokeDasharray="4 3"
                            />
                          )}
                          </svg>
                        </div>
                      </div>

                      {/* Sequence Flow & Discovered Endpoints */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
                        <h4 className="text-xs font-semibold text-slate-300">{tr('st.sequence')}</h4>
                        <ol className="space-y-2 text-xs text-slate-300">
                          <li className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                            {tr('st.seq1')}
                          </li>
                          <li className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                            {tr('st.seq2')}
                          </li>
                          <li className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                            {tr('st.seq3')}
                          </li>
                        </ol>
                        <div className="pt-1">
                          <div className="text-[11px] text-slate-400 mb-1.5">{tr('st.discoveredPaths')}</div>
                          <div dir="ltr" className="flex flex-wrap items-center gap-2 font-mono text-xs text-cyan-300">
                            {activeProject.diagrams.endpoints.map((ep, idx) => (
                              <React.Fragment key={ep}>
                                {idx > 0 && <span aria-hidden="true" className="text-slate-600">·</span>}
                                <span>{ep}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <pre dir="ltr" className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-sky-300 overflow-auto">
                        {activeProject.diagrams.erdMermaid}
                      </pre>
                      <pre dir="ltr" className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-teal-300 overflow-auto">
                        {activeProject.diagrams.sequenceMermaid}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'docker' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {dockerFiles.map((df) => (
                      <button
                        key={df}
                        type="button"
                        dir="ltr"
                        onClick={() => setDockerSubTab(df)}
                        className={`rounded-md border px-3 py-1 font-mono text-xs cursor-pointer ${
                          activeDockerFile === df
                            ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                            : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {df}
                      </button>
                    ))}
                  </div>
                  <pre
                    dir="ltr"
                    className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200"
                  >
                    {activeProject.files[activeDockerFile] || ''}
                  </pre>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                  <div className="md:col-span-4 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewFileOpen((v) => !v);
                        setFileSaveNote(null);
                      }}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-500/50 bg-slate-950 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{newFileOpen ? tr('st.closeNewFile') : tr('st.newFile')}</span>
                    </button>

                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 space-y-1">
                      {fileNames.map((fname) => (
                        <button
                          key={fname}
                          type="button"
                          dir="ltr"
                          onClick={() => {
                            setSelectedFile(fname);
                            setEditingFile(false);
                            setNewFileOpen(false);
                            setFileSaveNote(null);
                          }}
                          className={`block w-full truncate rounded px-2.5 py-1.5 text-left font-mono text-xs cursor-pointer ${
                            currentFileName === fname
                              ? 'bg-slate-800 text-cyan-300'
                              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                          }`}
                        >
                          {fname}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-8 space-y-2">
                    {newFileOpen ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const clean = newFilePath.trim();
                          if (!clean || !newFileContent.trim()) {
                            setFileSaveNote(tr('st.needFile'));
                            return;
                          }
                          setActionBusy('create-file');
                          setFileSaveNote(null);
                          try {
                            await onSaveProjectFile(activeProject.id, clean, newFileContent);
                            setSelectedFile(clean);
                            setNewFileOpen(false);
                            setNewFilePath('');
                            setNewFileContent('');
                            setFileSaveNote(tr('st.fileCreatedWith', { file: clean }));
                          } catch (err) {
                            setFileSaveNote(err instanceof Error ? err.message : tr('st.createFileError'));
                          } finally {
                            setActionBusy(null);
                          }
                        }}
                        className="rounded-lg border border-cyan-500/40 bg-slate-950 p-4 space-y-3"
                      >
                        <div className="text-xs font-semibold text-cyan-300">{tr('st.createFileTitle')}</div>
                        <div>
                          <label htmlFor="new-file-path" className="block text-xs text-slate-400 mb-1">
                            {tr('st.filePathHint')}
                          </label>
                          <input
                            id="new-file-path"
                            type="text"
                            dir="ltr"
                            value={newFilePath}
                            onChange={(e) => setNewFilePath(e.target.value)}
                            placeholder="validators.py"
                            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="new-file-body" className="block text-xs text-slate-400 mb-1">
                            {tr('st.fileBody')}
                          </label>
                          <textarea
                            id="new-file-body"
                            dir="ltr"
                            rows={10}
                            value={newFileContent}
                            onChange={(e) => setNewFileContent(e.target.value)}
                            placeholder="# Write real module code here..."
                            className="w-full rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={actionBusy === 'create-file'}
                            className="rounded bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
                          >
                            {actionBusy === 'create-file' ? tr('st.creating') : tr('st.createSaveVerify')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewFileOpen(false)}
                            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                          >
                            {tr('st.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                          <span dir="ltr" className="font-mono text-xs text-slate-300 truncate">
                            {currentFileName}
                          </span>
                          <div className="flex items-center gap-2">
                            {editingFile ? (
                              <>
                                <button
                                  type="button"
                                  disabled={actionBusy === 'save-file'}
                                  onClick={async () => {
                                    setActionBusy('save-file');
                                    setFileSaveNote(null);
                                    try {
                                      await onSaveProjectFile(activeProject.id, currentFileName, draftContent);
                                      setEditingFile(false);
                                      setFileSaveNote(tr('st.savedOk'));
                                    } catch (err) {
                                      setFileSaveNote(err instanceof Error ? err.message : tr('st.saveError'));
                                    } finally {
                                      setActionBusy(null);
                                    }
                                  }}
                                  className="rounded bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
                                >
                                  {actionBusy === 'save-file' ? tr('st.checking') : tr('st.saveVerify')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingFile(false)}
                                  className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                                >
                                  {tr('st.cancel')}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftContent(activeProject.files[currentFileName] || '');
                                  setEditingFile(true);
                                  setFileSaveNote(null);
                                }}
                                className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-cyan-300 hover:border-cyan-500 cursor-pointer"
                              >
                                {tr('st.editFile')}
                              </button>
                            )}
                          </div>
                        </div>

                        {fileSaveNote && (
                          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                            {fileSaveNote}
                          </div>
                        )}

                        {editingFile ? (
                          <textarea
                            dir="ltr"
                            rows={16}
                            value={draftContent}
                            onChange={(e) => setDraftContent(e.target.value)}
                            aria-label={tr('st.editorAria', { file: currentFileName })}
                            className="w-full rounded-lg border border-cyan-500/50 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-cyan-400 focus:outline-none"
                          />
                        ) : (
                          <pre
                            dir="ltr"
                            className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200"
                          >
                            {activeProject.files[currentFileName] || ''}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'diffs' && (
                <div className="space-y-3">
                  {activeProject.diffs.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 text-center text-xs text-slate-400">
                      {tr('st.noDiffs')}
                    </div>
                  ) : (
                    activeProject.diffs.map((d) => (
                      <div key={d.file} className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs font-mono">
                          <span dir="ltr" className="text-slate-200">{d.file}</span>
                          <span className="tabular-nums text-slate-400">
                            <span className="text-emerald-400">+{d.added}</span> /{' '}
                            <span className="text-rose-400">-{d.removed}</span>
                          </span>
                        </div>
                        <pre dir="ltr" className="overflow-auto p-3 font-mono text-xs leading-relaxed">
                          {d.diffText.split('\n').map((line, i) => (
                            <div
                              key={i}
                              className={
                                line.startsWith('+') && !line.startsWith('+++')
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : line.startsWith('-') && !line.startsWith('---')
                                    ? 'bg-rose-500/10 text-rose-300'
                                    : 'text-slate-400'
                              }
                            >
                              {line}
                            </div>
                          ))}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'report' && (
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200 font-sans">
                  {activeProject.reportMd}
                </pre>
              )}

              {activeTab === 'healing' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div>
                      <h3 className="text-xs font-semibold text-emerald-400">{tr('st.healAgent')}</h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {tr('st.healHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy === 'heal'}
                      onClick={async () => {
                        setActionBusy('heal');
                        setHeaderNotice(null);
                        try {
                          const summary = await onHealProject(activeProject.id);
                          setHeaderNotice({ ok: true, text: summary });
                        } catch (err) {
                          setHeaderNotice({
                            ok: false,
                            text: err instanceof Error ? err.message : tr('st.healError'),
                          });
                        } finally {
                          setActionBusy(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-400 cursor-pointer"
                    >
                      <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
                      {actionBusy === 'heal' ? tr('st.healingBusy') : tr('st.runHealing')}
                    </button>
                  </div>

                  {!activeProject.healing ? (
                    <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">
                      {tr('st.noHealing')}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                          <div className="text-[10px] text-slate-500">{tr('st.status')}</div>
                          <div className="text-xs font-semibold text-emerald-300">{activeProject.healing.status}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                          <div className="text-[10px] text-slate-500">{tr('st.scoreShort')}</div>
                          <div className="text-xs font-semibold text-cyan-300" dir="ltr">
                            {activeProject.healing.initialScore} → {activeProject.healing.finalScore}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                          <div className="text-[10px] text-slate-500">{tr('st.patches')}</div>
                          <div className="text-xs font-semibold text-slate-200">{activeProject.healing.attempts.length}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                          <div className="text-[10px] text-slate-500">{tr('st.testsRun')}</div>
                          <div className="text-xs font-semibold text-slate-200" dir="ltr">
                            {activeProject.healing.finalVerification.testsPassed}/{activeProject.healing.finalVerification.testsExecuted}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                        {activeProject.healing.summary}
                      </div>
                      <div className="space-y-2">
                        {activeProject.healing.attempts.map((attempt) => (
                          <div key={attempt.iteration} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-cyan-300">#{attempt.iteration} — {attempt.patchLabel}</span>
                              <span className="text-[11px] text-emerald-300" dir="ltr">{attempt.reason}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {attempt.issues.slice(0, 6).map((issue, i) => (
                                <span key={i} className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-300">
                                  {issue.kind}: {issue.message.slice(0, 70)}
                                </span>
                              ))}
                            </div>
                            {attempt.changedFiles.length > 0 && (
                              <div className="mt-2 text-[11px] text-slate-400" dir="ltr">
                                files: {attempt.changedFiles.join(', ')}
                              </div>
                            )}
                            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-2 text-[10px] text-slate-400 font-mono">
                              {attempt.verification.outputSnippet.slice(-700)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showExportModal && activeProject && (
        <ExportModal
          project={activeProject}
          language={language}
          onClose={() => setShowExportModal(false)}
          onProjectUpdated={onRefreshProjects}
        />
      )}
    </div>
  );
};
