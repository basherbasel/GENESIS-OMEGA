import { useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { DashboardView } from './components/DashboardView';
import { EnterpriseView } from './components/EnterpriseView';
import { persistLanguage, readStoredLanguage, t, type Language } from './lib/i18n';
import { LiveWaveformHud } from './components/LiveWaveformHud';
import { MigrationView } from './components/MigrationView';
import { SolutionCatalogView } from './components/SolutionCatalogView';
import { StudioView } from './components/StudioView';
import { TopNav } from './components/TopNav';
import { VaultView } from './components/VaultView';
import { VoiceHud } from './components/VoiceHud';
import { WatchView } from './components/WatchView';
import type {
  AgentRole,
  CognitiveProfile,
  DetailTab,
  EcosystemKey,
  GovernorStats,
  ModelRoutingConfig,
  ProjectRecord,
  SolutionDomainSummary,
  TopView,
  VaultEntry,
  VoiceCommandResponse,
  WatchFolder,
} from './lib/types';
import type { ModelOption } from './lib/routing';

export default function App() {
  const [activeView, setActiveView] = useState<TopView>('studio');
  const [language, setLanguage] = useState<Language>(() => readStoredLanguage());
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('logs');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [vault, setVault] = useState<VaultEntry[]>([]);
  const [watches, setWatches] = useState<WatchFolder[]>([]);
  const [governor, setGovernor] = useState<GovernorStats | null>(null);
  const [activeRouting, setActiveRouting] = useState<ModelRoutingConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [cognitive, setCognitive] = useState<CognitiveProfile>({
    traits: {},
    recentDialogue: [],
    pendingSuggestion: null,
  });
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const hydrateAll = useCallback(async () => {
    try {
      const [projResp, statusResp, vaultResp, watchResp, cogResp] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/status'),
        fetch('/api/vault'),
        fetch('/api/watches'),
        fetch('/api/cognitive'),
      ]);

      if (projResp.ok) {
        const pData = (await projResp.json()) as { projects: ProjectRecord[] };
        setProjects(pData.projects);
        setActiveProjectId((prev) => {
          if (prev && pData.projects.some((p) => p.id === prev)) return prev;
          return pData.projects[0]?.id ?? null;
        });
      }
      if (statusResp.ok) {
        const sData = (await statusResp.json()) as {
          governor: GovernorStats;
          activeRouting?: ModelRoutingConfig;
          availableModels?: ModelOption[];
        };
        setGovernor(sData.governor);
        if (sData.activeRouting) setActiveRouting(sData.activeRouting);
        if (sData.availableModels) setAvailableModels(sData.availableModels);
      }
      if (vaultResp.ok) {
        const vData = (await vaultResp.json()) as { vault: VaultEntry[] };
        setVault(vData.vault);
      }
      if (watchResp.ok) {
        const wData = (await watchResp.json()) as { watches: WatchFolder[] };
        setWatches(wData.watches);
      }
      if (cogResp.ok) {
        const cData = (await cogResp.json()) as { cognitive: CognitiveProfile };
        setCognitive(cData.cognitive);
      }
      setGlobalError(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t(language, 'app.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAuthReady = useCallback(() => {
    void hydrateAll();
  }, [hydrateAll]);

  const handleVoiceLanguageChange = useCallback((next: Language) => setLanguage(next), []);

  useEffect(() => {
    persistLanguage(language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Live push: the server publishes a `state` event on every store write.
  // hydrateAll remains the single source of truth for refreshing the UI, but
  // it is now event-driven instead of repeated polling after each action.
  useEffect(() => {
    const source = new EventSource('/api/events');
    source.addEventListener('state', () => {
      void hydrateAll();
    });
    source.addEventListener('job', () => {
      void hydrateAll();
    });
    return () => source.close();
  }, [hydrateAll]);

  const handleVoiceResult = (res: VoiceCommandResponse) => {
    setCognitive((prev) => ({
      ...prev,
      pendingSuggestion: res.pendingSuggestion,
    }));

    if (res.uiCommand) {
      const cmd = res.uiCommand;
      if (cmd.action === 'switch_view' && cmd.view) {
        setActiveView(cmd.view);
      } else if (cmd.action === 'select_project') {
        setActiveView('studio');
        if (cmd.projectId) setActiveProjectId(cmd.projectId);
        if (cmd.tab) setActiveTab(cmd.tab);
      }
    }

    void hydrateAll();
  };

  const handleConfirmSuggestion = async (): Promise<VoiceCommandResponse | null> => {
    try {
      const resp = await fetch('/api/voice/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: 'أيوه يلا بينا', activeProjectId }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as VoiceCommandResponse;
        handleVoiceResult(data);
        return data;
      }
    } catch {
      // keep the suggestion visible; the user can retry
    }
    return null;
  };

  const handleDismissSuggestion = () => {
    setCognitive((prev) => ({ ...prev, pendingSuggestion: null }));
  };

  const handleCreateProject = async (payload: {
    title: string;
    prompt: string;
    ecosystem?: EcosystemKey;
    solutionDomain?: string;
    modelOverrides?: Partial<Record<AgentRole, string>>;
    useAi?: boolean;
  }) => {
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر إنشاء المشروع.');
    }
    setProjects((prev) => [data.project!, ...prev]);
    setActiveProjectId(data.project.id);
    setActiveTab('logs');
  };

  const handlePromoteSolution = async (
    domain: SolutionDomainSummary,
    projectTitle: string,
    projectPrompt: string,
  ) => {
    const taggedPrompt = `[Solution Domain: ${domain.id}] ${projectPrompt}`;
    await handleCreateProject({
      title: projectTitle,
      prompt: taggedPrompt,
      ecosystem: domain.ecosystem,
      solutionDomain: domain.id,
    });
    setActiveView('studio');
    setShowCreateForm(false);
    void hydrateAll();
  };

  const handleUploadZipProject = async (payload: {
    title: string;
    prompt: string;
    zipBase64: string;
    modelOverrides?: Partial<Record<AgentRole, string>>;
  }) => {
    const resp = await fetch('/api/projects/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر تدقيق ملف ZIP.');
    }
    setProjects((prev) => [data.project!, ...prev]);
    setActiveProjectId(data.project.id);
    setActiveTab('sbom');
  };

  const replaceProject = (updated: ProjectRecord) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleStartSandbox = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/sandbox/start`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as { project: ProjectRecord };
      replaceProject(data.project);
      setActiveTab('sandbox');
    }
  };

  const handleStopSandbox = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/sandbox/stop`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as { project: ProjectRecord };
      replaceProject(data.project);
    }
  };

  const handleRunBenchmark = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/benchmark`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as { project: ProjectRecord };
      replaceProject(data.project);
      setActiveTab('benchmark');
    }
  };

  const handleRetryProject = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/retry`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as { project: ProjectRecord };
      replaceProject(data.project);
    }
  };

  const handleDeleteProject = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (resp.ok) {
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (activeProjectId === id) {
          setActiveProjectId(next[0]?.id ?? null);
        }
        return next;
      });
    }
  };

  const handleSaveProjectFile = async (id: number, filePath: string, content: string) => {
    const resp = await fetch(`/api/projects/${id}/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content }),
    });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر حفظ الملف وإعادة فحصه.');
    }
    replaceProject(data.project);
  };

  const handleVerifyProject = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/verify`, { method: 'POST' });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر تنفيذ الفحص الفعلي.');
    }
    replaceProject(data.project);
  };

  const handleHealProject = async (id: number): Promise<string> => {
    const resp = await fetch(`/api/projects/${id}/heal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxIterations: 4 }),
    });
    const data = (await resp.json()) as { project?: ProjectRecord; healing?: { summary: string }; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر تشغيل وكيل الإصلاح الذاتي.');
    }
    replaceProject(data.project);
    return data.healing?.summary || 'اكتملت دورة الإصلاح الذاتي.';
  };

  const handleAiSynthesizeProject = async (id: number) => {
    const resp = await fetch(`/api/projects/${id}/ai-synthesize`, { method: 'POST' });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر تشغيل التوليد الذكي عبر Gemini.');
    }
    replaceProject(data.project);
  };

  const handlePromoteMigratedProject = async (payload: {
    title: string;
    prompt: string;
    files: Record<string, string>;
  }) => {
    const resp = await fetch('/api/projects/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { project?: ProjectRecord; error?: string };
    if (!resp.ok || !data.project) {
      throw new Error(data.error || 'تعذر اعتماد المشروع المرحّل في الاستوديو.');
    }
    setProjects((prev) => [data.project!, ...prev]);
    setActiveProjectId(data.project.id);
    setActiveTab('files');
    setActiveView('studio');
  };

  const handleAddWatch = async (payload: {
    folderPath: string;
    goal: string;
    intervalSec: number;
  }) => {
    const resp = await fetch('/api/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { watch?: WatchFolder; error?: string };
    if (!resp.ok || !data.watch) throw new Error(data.error || 'تعذر إضافة المجلد.');
    setWatches((prev) => [data.watch!, ...prev]);
  };

  const handleToggleWatch = async (id: number) => {
    const resp = await fetch(`/api/watches/${id}/toggle`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as { watch: WatchFolder };
      setWatches((prev) => prev.map((w) => (w.id === id ? data.watch : w)));
    }
  };

  const handleScanAllWatches = async (watchId?: number) => {
    const resp = await fetch('/api/watches/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchId }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { watches: WatchFolder[]; triggeredProjects?: ProjectRecord[] };
      setWatches(data.watches);
      if (data.triggeredProjects && data.triggeredProjects.length > 0) {
        setProjects((prev) => [...data.triggeredProjects!, ...prev]);
      }
    }
  };

  const handleDeleteWatch = async (id: number) => {
    const resp = await fetch(`/api/watches/${id}`, { method: 'DELETE' });
    if (resp.ok) {
      setWatches((prev) => prev.filter((w) => w.id !== id));
    }
  };

  const handleAddVaultRule = async (payload: {
    domain: string;
    pattern: string;
    verifiedWisdom: string;
  }) => {
    const resp = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { entry?: VaultEntry; error?: string };
    if (!resp.ok || !data.entry) throw new Error(data.error || 'تعذر حفظ القاعدة.');
    setVault((prev) => [data.entry!, ...prev]);
  };

  const handleDeleteVaultRule = async (id: number) => {
    const resp = await fetch(`/api/vault/${id}`, { method: 'DELETE' });
    if (resp.ok) {
      setVault((prev) => prev.filter((v) => v.id !== id));
    }
  };

  return (
    <AuthGate language={language} onReady={handleAuthReady}>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-slate-100">
      <TopNav
        activeView={activeView}
        onSelectView={setActiveView}
        language={language}
        onToggleLanguage={() => setLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'))}
        onNewProjectClick={() => {
          setActiveView('studio');
          setShowCreateForm(true);
        }}
      />

      <VoiceHud
        language={language}
        onLanguageChange={handleVoiceLanguageChange}
        activeProjectId={activeProjectId}
      />

      <LiveWaveformHud
        activeProjectId={activeProjectId}
        pendingSuggestion={cognitive.pendingSuggestion}
        onVoiceResult={handleVoiceResult}
        onConfirmSuggestion={handleConfirmSuggestion}
        onDismissSuggestion={handleDismissSuggestion}
          language={language}
      />

      {globalError && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6">
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2 text-xs text-rose-300">
            {globalError}
          </div>
        </div>
      )}

      {loading ? (
        <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
        </div>
      ) : activeView === 'studio' ? (
        <StudioView
          projects={projects}
          activeProjectId={activeProjectId}
          activeTab={activeTab}
          showCreateForm={showCreateForm}
          defaultRouting={activeRouting}
          availableModels={availableModels}
          onSelectProject={setActiveProjectId}
          onSelectTab={setActiveTab}
          onToggleCreateForm={setShowCreateForm}
          onCreateProject={handleCreateProject}
          onUploadZipProject={handleUploadZipProject}
          onStartSandbox={handleStartSandbox}
          onStopSandbox={handleStopSandbox}
          onRunBenchmark={handleRunBenchmark}
          onRetryProject={handleRetryProject}
          onDeleteProject={handleDeleteProject}
          onSaveProjectFile={handleSaveProjectFile}
          onVerifyProject={handleVerifyProject}
          onHealProject={handleHealProject}
          onAiSynthesize={handleAiSynthesizeProject}
          onRefreshProjects={hydrateAll}
          language={language}
        />
      ) : activeView === 'solutions' ? (
        <SolutionCatalogView language={language} onPromoteToProject={handlePromoteSolution} />
      ) : activeView === 'watch' ? (
        <WatchView
          watches={watches}
          onAddWatch={handleAddWatch}
          onToggleWatch={handleToggleWatch}
          onScanAll={handleScanAllWatches}
          onDeleteWatch={handleDeleteWatch}
          language={language}
        />
      ) : activeView === 'dashboard' ? (
        <DashboardView projects={projects} governor={governor} activeRouting={activeRouting} language={language} />
      ) : activeView === 'enterprise' ? (
        <EnterpriseView language={language} />
      ) : activeView === 'vault' ? (
        <VaultView
          projects={projects}
          vault={vault}
          cognitive={cognitive}
          governor={governor}
          activeRouting={activeRouting}
          onAddVaultRule={handleAddVaultRule}
          onDeleteVaultRule={handleDeleteVaultRule}
          language={language}
        />
      ) : (
        <MigrationView language={language} onPromoteMigratedProject={handlePromoteMigratedProject} />
      )}
      </div>
    </AuthGate>
  );
}
