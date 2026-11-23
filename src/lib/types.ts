export type EcosystemKey =
  | 'python'
  | 'nodejs'
  | 'typescript'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'java'
  | 'php'
  | 'ruby'
  | 'bash'
  | 'powershell'
  | 'pascal'
  | 'fortran'
  | 'cobol'
  | 'lua'
  | 'flutter';

export interface EcosystemMeta {
  key: EcosystemKey;
  displayName: string;
  category: string;
  keywords: string[];
  baseImage: string;
  buildCmd: string;
  testCmd: string;
  dockerCmd: string;
  entryFile: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  title: string;
  ecosystem: EcosystemKey;
  prompt: string;
}

export type ProjectStatus = 'queued' | 'running' | 'verified' | 'needs_review' | 'failed';
export type ProjectMode = 'new' | 'audit';

export interface SandboxState {
  running: boolean;
  port: number | null;
  url: string | null;
  startedAt: string | null;
  logs: string;
}

export interface BenchmarkReport {
  status: 'completed' | 'skipped';
  reason?: string;
  totalRequests: number;
  concurrency: number;
  successCount: number;
  errorCount: number;
  rps: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  measuredAt: string;
}

export interface SecretFinding {
  file: string;
  type: string;
  line: number;
}

export interface SbomComponent {
  type: 'file' | 'library';
  name: string;
  sizeBytes?: number;
  ecosystem?: string;
  hashes?: Array<{ alg: string; content: string }>;
}

export interface SbomDocument {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  version: number;
  metadata: {
    timestamp: string;
    component: { name: string; type: 'application' };
    tools: Array<{ name: string; version: string }>;
  };
  components: SbomComponent[];
  securityAudit: {
    hardcodedSecretsDetected: number;
    findings: SecretFinding[];
    supplyChainStatus: 'clean' | 'warning';
  };
}

export interface DiagramEntity {
  name: string;
  fields: string[];
}

export interface DiagramBundle {
  erdMermaid: string;
  sequenceMermaid: string;
  entities: DiagramEntity[];
  endpoints: string[];
}

export interface DiffEntry {
  file: string;
  status: 'added' | 'removed' | 'modified';
  added: number;
  removed: number;
  diffText: string;
}

export interface LegacyFileHit {
  path: string;
  language: string;
}

export interface LegacyMigrationResult {
  legacyDetected: LegacyFileHit[];
  modernizedFiles: string[];
  targetLanguage: string;
  reportMarkdown: string;
  verification?: ExecutionVerifySummary;
}

export type AgentRole =
  | 'architect'
  | 'strategist'
  | 'builder_alpha'
  | 'builder_beta'
  | 'red_team'
  | 'synthesizer_healer';

export type ModelRoutingConfig = Record<AgentRole, string>;

export interface DiscoveredEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  summary: string;
  sampleResponse: Record<string, unknown>;
}

export interface RollbackSummary {
  applied: boolean;
  reason: string;
  baselineScore: number;
  candidateScore: number;
}

export interface ExportBundleManifest {
  projectId: number;
  slug: string;
  mode: 'local_bundle' | 'git_deploy';
  fileCount: number;
  totalBytes: number;
  exportedDir?: string;
  /** Absolute on-disk path of the materialized bundle (server use only). */
  exportedAbsDir?: string;
  gitInitialized?: boolean;
  sanitizedRemoteUrl?: string;
  branch?: string;
  deployScript?: string;
  filesSummary: Array<{ path: string; sizeBytes: number; sha256: string }>;
  generatedAt: string;
}

export interface ExecutionVerifySummary {
  ranRealTests: boolean;
  runtime: 'python3' | 'node' | 'static-validator' | 'toolchain-command';
  testsExecuted: number;
  testsPassed: number;
  redTeamPassed: boolean;
  exitCode: number;
  outputSnippet: string;
  workspaceDir?: string;
}

/** One real Git command executed by the deploy agent. */
export interface GitDeployStep {
  cmd: string;
  ok: boolean;
  /** Optional probes/cleanup may fail without invalidating the deployment. */
  optional?: boolean;
  output: string;
  durationMs: number;
}

/** Result of a real, sandboxed Git commit/push (never carries credentials). */
export interface GitDeployResult {
  success: boolean;
  dryRun: boolean;
  repoDir: string;
  remote: string;
  branch: string;
  commitHash: string | null;
  committed: boolean;
  pushed: boolean;
  steps: GitDeployStep[];
  commandPreview: string[];
  error?: string;
  finishedAt: string;
}

/** Persisted deployment record attached to a project. */
export interface GitDeployRecord {
  manifest: ExportBundleManifest;
  result: GitDeployResult;
  executedAt: string;
}

/** A root cause detected by the autonomous healer from real verifier output. */
export interface HealingIssue {
  kind:
    | 'python_syntax'
    | 'python_missing_module'
    | 'python_import_symbol'
    | 'json_syntax'
    | 'security_static'
    | 'secret_exposure'
    | 'redteam_violation'
    | 'test_failure'
    | 'toolchain_failure';
  file?: string;
  line?: number;
  symbol?: string;
  message: string;
  evidence: string;
}

/** One measured iteration of the autonomous self-healing loop. */
export interface HealingAttempt {
  iteration: number;
  issues: HealingIssue[];
  patchId: string;
  patchLabel: string;
  changedFiles: string[];
  accepted: boolean;
  reason: string;
  scoreBefore: number;
  scoreAfter: number;
  testsBefore: number;
  testsAfter: number;
  verification: ExecutionVerifySummary;
}

/** Full audit trail of a self-healing session. */
export interface HealingReport {
  projectId: number;
  startedAt: string;
  finishedAt: string;
  status: 'improved' | 'stable' | 'exhausted';
  initialScore: number;
  finalScore: number;
  initialVerification: ExecutionVerifySummary;
  finalVerification: ExecutionVerifySummary;
  attempts: HealingAttempt[];
  summary: string;
}

export interface ProjectRecord {
  id: number;
  title: string;
  prompt: string;
  mode: ProjectMode;
  status: ProjectStatus;
  language: string;
  ecosystemKey: EcosystemKey;
  score: number;
  testsRun: number;
  redTeamStatus: 'survived' | 'breached' | 'pending';
  createdAt: string;
  finishedAt: string | null;
  liveLogs: string;
  reportMd: string;
  reasoningBrief: string;
  predictedRequirements: string[];
  files: Record<string, string>;
  baselineFiles?: Record<string, string>;
  diffs: DiffEntry[];
  sandbox: SandboxState;
  benchmark: BenchmarkReport | null;
  sbom: SbomDocument | null;
  diagrams: DiagramBundle;
  legacyMigration: LegacyMigrationResult | null;
  routingUsed?: ModelRoutingConfig;
  discoveredEndpoints?: DiscoveredEndpoint[];
  rollbackSummary?: RollbackSummary;
  verification?: ExecutionVerifySummary;
  synthesisEngine?: 'gemini-ai' | 'ollama-local' | 'domain-synthesizer';
  healing?: HealingReport | null;
  deployment?: GitDeployRecord | null;
}

export interface WatchFolder {
  id: number;
  folderPath: string;
  goal: string;
  intervalSec: number;
  enabled: boolean;
  filesCount: number;
  lastCheckedAt: string | null;
  lastTriggeredProjectId: number | null;
  lastTreeHash?: string;
  /** Per-file SHA-256 snapshot used to report only genuinely changed files. */
  lastFileHashes?: Record<string, string>;
  changedFiles?: string[];
}

export interface VaultEntry {
  id: number;
  domain: string;
  pattern: string;
  verifiedWisdom: string;
  createdAt: string;
}

export type ThinkingStyle =
  | 'architectural_visionary'
  | 'action_executor'
  | 'analytical_explorer'
  | 'collaborative_builder';

export type CognitiveEmotion =
  | 'empathetic_focused'
  | 'warm_enthusiastic'
  | 'crisp_energetic'
  | 'calm_human';

export interface ProsodyConfig {
  rate: number;
  pitch: number;
}

export interface NeuralTtsStatus {
  piper_binary_found: boolean;
  piper_binary: string;
  arabic_model_found: boolean;
  model_path: string;
  offline_neural_ready: boolean;
  cache_dir: string;
  last_error?: string;
}

export interface MindsetAnalysis {
  thinkingStyle: ThinkingStyle;
  thinkingStyleLabel: string;
  emotion: CognitiveEmotion;
  emotionLabel: string;
  prosody: ProsodyConfig;
}

export interface DialogueTurn {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  thinkingStyle?: ThinkingStyle;
  emotion?: CognitiveEmotion;
  intent?: string;
  createdAt: string;
}

export interface PendingSuggestion {
  action: 'create_project' | 'benchmark' | 'start_sandbox' | 'migrate_legacy';
  payload: string;
  projectId: number | null;
}

export interface StoreData {
  nextProjectId: number;
  nextVaultId: number;
  nextWatchId: number;
  nextDialogueId: number;
  projects: ProjectRecord[];
  vault: VaultEntry[];
  watches: WatchFolder[];
  cognitive: CognitiveProfile;
}

export interface CognitiveProfile {
  traits: Record<string, string>;
  recentDialogue: DialogueTurn[];
  pendingSuggestion: PendingSuggestion | null;
}

export interface GovernorStats {
  os: string;
  cpuCores: number;
  totalRamGb: number;
  availableRamGb: number;
  ramUsedPct: number;
  profile: 'eco_ultra_light' | 'balanced_light' | 'performance';
  ollamaTuning: {
    numCtx: number;
    numThread: number;
    keepAlive: string;
  };
  maxPromptChars: number;
  watchPollSec: number;
}

export type TopView = 'studio' | 'solutions' | 'watch' | 'vault' | 'migration' | 'dashboard';

export interface SolutionDomainSummary {
  id: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  category: string;
  ecosystem: EcosystemKey;
  tags: string[];
  entryFile: string;
  testCommand: string;
}

export interface SolutionGenerationResult {
  domain: string;
  ecosystem: EcosystemKey;
  entryFile: string;
  testCommand: string;
  files: Record<string, string>;
  verification: ExecutionVerifySummary;
}
export type DetailTab =
  | 'logs'
  | 'sandbox'
  | 'benchmark'
  | 'sbom'
  | 'diagrams'
  | 'docker'
  | 'files'
  | 'diffs'
  | 'report'
  | 'healing';

export interface UiCommand {
  action: 'select_project' | 'switch_view' | 'refresh';
  projectId?: number;
  tab?: DetailTab;
  view?: TopView;
}

export interface VoiceCommandResponse {
  intent: string;
  projectId?: number;
  ecosystem?: EcosystemKey;
  spokenReply: string;
  prosody: ProsodyConfig;
  mindset: MindsetAnalysis;
  uiCommand: UiCommand | null;
  engineSource: 'gemini-cognitive' | 'deterministic-nlu';
  pendingSuggestion: PendingSuggestion | null;
  /** Local Piper WAV endpoint when offline neural synthesis succeeded. */
  audio_url?: string | null;
  /** Availability snapshot of the offline neural voice engine. */
  neural_tts?: NeuralTtsStatus;
  data?: unknown;
}

export type WaveformMode = 'idle' | 'listening' | 'thinking' | 'speaking';
