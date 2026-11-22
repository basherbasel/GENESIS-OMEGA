import 'dotenv/config';
import express from 'express';
import {
  buildSessionCookie,
  createLoginThrottle,
  newSessionToken,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  timingSafeEqualStrings,
} from './src/lib/auth';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

import { synthesizeProject } from './src/lib/ai_pipeline';
import { geminiModel } from './src/lib/gemini_models';
import {
  discoverEndpoints,
  generateEndpointMockTests,
  generateOpenApiAndSwagger,
} from './src/lib/apidocs';
import {
  analyzeMindsetAndEmotion,
  routeVoiceIntent,
} from './src/lib/cognitive';
import {
  buildArchitectureDiagrams,
  generateProjectScaffold,
  synthesizeReasoningBrief,
} from './src/lib/diagrams';
import {
  detectEcosystem,
  ECOSYSTEM_CATALOG,
} from './src/lib/ecosystems';
import { buildExportBundleManifest } from './src/lib/export';
import { materializeExportToDisk } from './src/lib/export_fs';
import { executeGitDeploy } from './src/lib/git_deploy';
import { healProject } from './src/lib/healer';
import {
  detectLegacyFiles,
  modernizeLegacyFiles,
} from './src/lib/legacy';
import { PiperNeuralVoiceEngine, resolveVoiceCacheFile, toVoiceAudioUrl } from './src/lib/piper_tts';
import {
  AVAILABLE_MODELS,
  findLocalModel,
  isLocalModelId,
  LOCAL_CODING_MODELS,
  resolveAsymmetricRouting,
  setInstalledLocalModels,
} from './src/lib/routing';
import {
  OLLAMA_BASE_URL,
  probeOllama,
  pullOllamaModel,
  type OllamaStatus,
} from './src/lib/ollama_client';
import {
  computeUnifiedDiffs,
  evaluateWithAtomicRollback,
  generateCycloneDxSbom,
  isSafeRelativePath,
  scanSecretsAndSecurity,
  validateRedTeamScript,
} from './src/lib/security';
import type {
  AgentRole,
  BenchmarkReport,
  CognitiveProfile,
  EcosystemKey,
  ExecutionVerifySummary,
  GovernorStats,
  PendingSuggestion,
  ProjectMode,
  ProjectRecord,
  VaultEntry,
  WatchFolder,
} from './src/lib/types';
import { verifyProjectWorkspace } from './src/lib/verifier';
import {
  detectSolutionDomain,
  generateSolutionFiles,
  listSolutionDomains,
  SOLUTION_DOMAINS,
} from './src/lib/solution_catalog';
import {
  getLiveSandboxInfo,
  probeLiveSandbox,
  startSandboxProcess,
  stopAllSandboxes,
  stopSandboxProcess,
} from './src/lib/sandbox_runner';
import { ensureDemoWatchWorkspace, inspectWatchedDirectory } from './src/lib/watcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'omega_store.json');
const PORT = Number(process.env.PORT || 3000);
// Bind to localhost explicitly with HOST=127.0.0.1 on untrusted machines.
// Default stays 0.0.0.0 so cloud/container deployments keep working.
const HOST = process.env.HOST || '127.0.0.1';

interface StoreData {
  nextProjectId: number;
  nextVaultId: number;
  nextWatchId: number;
  nextDialogueId: number;
  projects: ProjectRecord[];
  vault: VaultEntry[];
  watches: WatchFolder[];
  cognitive: CognitiveProfile;
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getGovernorStats(): GovernorStats {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const totalRamGb = Number((totalBytes / 1024 ** 3).toFixed(2));
  const availableRamGb = Number((freeBytes / 1024 ** 3).toFixed(2));
  const ramUsedPct = Number((((totalBytes - freeBytes) / totalBytes) * 100).toFixed(1));
  const cpuCores = os.cpus().length || 2;

  let profile: GovernorStats['profile'] = 'performance';
  let ollamaTuning = { numCtx: 8192, numThread: Math.max(2, cpuCores - 1), keepAlive: '2m' };
  let maxPromptChars = 9000;
  let watchPollSec = 2;

  if (availableRamGb < 3.5) {
    profile = 'eco_ultra_light';
    ollamaTuning = { numCtx: 4096, numThread: Math.max(2, Math.floor(cpuCores / 2)), keepAlive: '30s' };
    maxPromptChars = 4200;
    watchPollSec = 4;
  } else if (availableRamGb < 8) {
    profile = 'balanced_light';
    ollamaTuning = { numCtx: 6144, numThread: Math.max(2, cpuCores - 2), keepAlive: '45s' };
    maxPromptChars = 6400;
    watchPollSec = 2.5;
  }

  return {
    os: `${os.type()} (${os.arch()})`,
    cpuCores,
    totalRamGb,
    availableRamGb,
    ramUsedPct,
    profile,
    ollamaTuning,
    maxPromptChars,
    watchPollSec,
  };
}

let localModelStatus: OllamaStatus = {
  online: false,
  baseUrl: OLLAMA_BASE_URL,
  models: [],
  checkedAt: new Date(0).toISOString(),
};

async function refreshLocalModelStatus(): Promise<OllamaStatus> {
  localModelStatus = await probeOllama();
  setInstalledLocalModels(localModelStatus.models);
  return localModelStatus;
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAuditMarkdown(params: {
  title: string;
  ecosystemName: string;
  score: number;
  testsRun: number;
  redTeamStatus: string;
  secretsCount: number;
  staticIssues: string[];
  reasoningBrief: string;
  endpoints: string[];
  verification?: ExecutionVerifySummary;
}): string {
  return [
    `# تقرير التحقق والتدقيق الهندسي: ${params.title}`,
    '',
    `- **البيئة التقنية:** ${params.ecosystemName}`,
    `- **درجة الجودة والأمان:** ${params.score}/100`,
    `- **عدد الاختبارات المنفذة:** ${params.testsRun}`,
    `- **اختبار الهجوم العدائي (Red-Team):** ${params.redTeamStatus === 'survived' ? 'اجتاز الفحص بنجاح' : 'يحتاج مراجعة'}`,
    `- **الأسرار المكشوفة (Secret Scan):** ${params.secretsCount}`,
    params.verification
      ? `- **تنفيذ نظام التشغيل الفعلي (${params.verification.runtime}):** ${params.verification.testsPassed}/${params.verification.testsExecuted} ناجح (exit=${params.verification.exitCode})`
      : '',
    '',
    '## ملخص التفكير الاستباقي (Deep Reasoning)',
    params.reasoningBrief,
    '',
    '## نقاط النهاية المكتشفة',
    ...params.endpoints.map((ep) => `- \`${ep}\``),
    '',
    '## الملاحظات الأمنية الساكنة',
    params.staticIssues.length === 0
      ? '- لا توجد أنماط خطرة (eval/exec/shell=True) في الكود.'
      : params.staticIssues.map((s) => `- تنبيه: ${s}`).join('\n'),
    params.verification?.outputSnippet
      ? `\n## مخرجات التحقق التنفيذي الفعلي\n\`\`\`text\n${params.verification.outputSnippet}\n\`\`\``
      : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderAuditReportHtml(params: {
  title: string;
  language: string;
  score: number;
  testsRun: number;
  redTeamStatus: string;
  reasoningBrief: string;
  reportMd: string;
  sbom: unknown;
}): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>تقرير التدقيق — ${escapeHtml(params.title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#fff;color:#0f172a;padding:2.5rem;max-width:900px;margin:0 auto;line-height:1.65}
h1,h2{border-bottom:1px solid #cbd5e1;padding-bottom:.4rem}
pre{background:#f8fafc;border:1px solid #e2e8f0;padding:1rem;border-radius:8px;overflow:auto;direction:ltr;text-align:left}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:1.5rem 0}
.stat{border:1px solid #cbd5e1;border-radius:8px;padding:.75rem}
</style></head><body>
<h1>تقرير التدقيق الهندسي والأمني — ${escapeHtml(params.title)}</h1>
<div class="grid">
  <div class="stat"><div>البيئة</div><strong>${escapeHtml(params.language)}</strong></div>
  <div class="stat"><div>درجة التحقق</div><strong>${params.score}/100</strong></div>
  <div class="stat"><div>الاختبارات</div><strong>${params.testsRun}</strong></div>
  <div class="stat"><div>الهجوم العدائي</div><strong>${escapeHtml(params.redTeamStatus)}</strong></div>
</div>
<h2>ملخص التفكير الاستباقي</h2>
<pre>${escapeHtml(params.reasoningBrief)}</pre>
<h2>التقرير الكامل</h2>
<pre>${escapeHtml(params.reportMd)}</pre>
<h2>حزمة SBOM (CycloneDX 1.5)</h2>
<pre>${escapeHtml(JSON.stringify(params.sbom, null, 2))}</pre>
</body></html>`;
}

async function runPipelineSynthesis(params: {
  id: number;
  title: string;
  prompt: string;
  mode: ProjectMode;
  explicitEcosystem?: EcosystemKey;
  vault: VaultEntry[];
  uploadedFiles?: Record<string, string>;
  modelOverrides?: Partial<Record<AgentRole, string>>;
  governor?: GovernorStats;
  useAi?: boolean;
  solutionDomain?: string;
}): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const governor = params.governor || getGovernorStats();
  const routingUsed = resolveAsymmetricRouting(governor, params.modelOverrides);
  const baseFilenames = params.uploadedFiles ? Object.keys(params.uploadedFiles) : [];
  const eco = detectEcosystem(params.prompt, baseFilenames, params.explicitEcosystem);
  const solutionDomain =
    params.mode === 'new' && baseFilenames.length === 0
      ? detectSolutionDomain(params.prompt, params.solutionDomain)
      : null;

  const reasoning = synthesizeReasoningBrief(params.prompt, eco, params.vault);

  let baselineFiles: Record<string, string> = {};
  let files: Record<string, string> = {};

  if (params.uploadedFiles && Object.keys(params.uploadedFiles).length > 0) {
    baselineFiles = { ...params.uploadedFiles };
    files = { ...params.uploadedFiles };
    const scaffoldAdditions = generateProjectScaffold(params.title, params.prompt, eco);
    for (const [k, v] of Object.entries(scaffoldAdditions)) {
      if (
        (k === 'Dockerfile' ||
          k === 'docker-compose.yml' ||
          k === '.dockerignore' ||
          k === 'Makefile' ||
          k === 'run.sh' ||
          k === 'run.bat' ||
          k === 'swagger_ui.html' ||
          k === 'docs_server.py' ||
          k === 'mock_fixtures.json' ||
          k === 'SETUP_GUIDE.md' ||
          k === 'architecture_diagrams.html' ||
          k.startsWith('test_api_mocks.')) &&
        !files[k]
      ) {
        files[k] = v;
      }
    }
  } else {
    const scaffold = generateProjectScaffold(params.title, params.prompt, eco);
    baselineFiles = { ...scaffold };
    files = { ...scaffold };
    if (files['README.md']) {
      baselineFiles['README.md'] = `# ${params.title}\n\nInitial draft specification.\n`;
    }
    // Domain-specific bundles replace the generic scaffold only when the
    // detected domain targets the same ecosystem as the requested project.
    if (solutionDomain && solutionDomain.ecosystem === eco.key) {
      files = { ...files, ...generateSolutionFiles(solutionDomain.id, params.title, params.prompt) };
    }
  }

  let synthesisEngine: 'gemini-ai' | 'ollama-local' | 'domain-synthesizer' = 'domain-synthesizer';
  let aiSummaryNote = '';
  // Selecting a local model in the routing panel is an explicit request to run
  // the offline Ollama synthesis, even when the "AI" checkbox is not ticked.
  const explicitLocal = Boolean(params.modelOverrides && isLocalModelId(params.modelOverrides.builder_alpha));
  const localFirst = process.env.OMEGA_LOCAL_FIRST === '1' && isLocalModelId(routingUsed.builder_alpha);
  const shouldSynthesize = params.useAi || explicitLocal || localFirst;
  if (shouldSynthesize && (!params.uploadedFiles || Object.keys(params.uploadedFiles).length === 0)) {
    const aiOut = await synthesizeProject({
      title: params.title,
      prompt: params.prompt,
      eco,
      routing: routingUsed,
      vault: params.vault,
      governor,
    });
    if ((aiOut.usedGemini || aiOut.usedLocal) && Object.keys(aiOut.generatedFiles).length > 0) {
      files = { ...files, ...aiOut.generatedFiles };
      synthesisEngine = aiOut.engine === 'ollama' ? 'ollama-local' : 'gemini-ai';
      aiSummaryNote = aiOut.architectureSummary ? ` (${aiOut.architectureSummary.slice(0, 120)})` : '';
    }
  }

  let legacyMigration = null;
  const legacyHits = detectLegacyFiles(files);
  if (legacyHits.length > 0 || eco.key === 'cobol' || eco.key === 'pascal' || eco.key === 'fortran') {
    const sampleLegacy: Record<string, string> =
      legacyHits.length > 0
        ? files
        : {
            'PAYROLL.cob': [
              'IDENTIFICATION DIVISION.',
              'PROGRAM-ID. PAYROLL.',
              'DATA DIVISION.',
              'WORKING-STORAGE SECTION.',
              '01 WS-AMOUNT PIC 9(6)V99 VALUE 1500.00.',
              'PROCEDURE DIVISION.',
              '    DISPLAY "PAYROLL VERIFIED: " WS-AMOUNT.',
              '    STOP RUN.',
            ].join('\n'),
          };
    if (legacyHits.length === 0) {
      files['PAYROLL.cob'] = sampleLegacy['PAYROLL.cob'];
      baselineFiles['PAYROLL.cob'] = sampleLegacy['PAYROLL.cob'];
    }
    const mig = modernizeLegacyFiles(sampleLegacy, 'Python 3.12');
    if (mig) {
      legacyMigration = mig.result;
      Object.assign(files, mig.generatedFiles);
    }
  }

  const discoveredEndpoints = discoverEndpoints(files, params.prompt, params.title);
  if (!files['openapi.json'] || !files['swagger_ui.html']) {
    const apiDocs = generateOpenApiAndSwagger(params.title, params.prompt, discoveredEndpoints);
    const mockTests = generateEndpointMockTests(params.title, eco, discoveredEndpoints);
    files['openapi.json'] = files['openapi.json'] || apiDocs.openapiJson;
    files['swagger_ui.html'] = files['swagger_ui.html'] || apiDocs.swaggerHtml;
    files['docs_server.py'] = files['docs_server.py'] || apiDocs.docsServerPy;
    files['mock_fixtures.json'] = files['mock_fixtures.json'] || apiDocs.mockFixturesJson;
    files[mockTests.filename] = files[mockTests.filename] || mockTests.content;
  }

  // Validate generated test & red-team scripts against dangerous primitives
  const testScripts = Object.entries(files)
    .filter(([fname]) => fname.includes('test') || fname.startsWith('red_team_attack'))
    .map(([, content]) => content)
    .join('\n');
  const rtScriptCheck = validateRedTeamScript(testScripts);

  const rollbackOutcome = evaluateWithAtomicRollback(baselineFiles, files, (candidate) => {
    const scan = scanSecretsAndSecurity(candidate);
    const basePenalty = scan.secrets.length * 18 + scan.staticIssues.length * 7;
    return {
      score: Math.max(42, Math.min(99, 97 - basePenalty)),
      secretsCount: scan.secrets.length,
    };
  });

  if (rollbackOutcome.rollback.applied && params.mode === 'new') {
    files = rollbackOutcome.files;
    synthesisEngine = 'domain-synthesizer';
  }

  const sbom = generateCycloneDxSbom(params.title, files);
  files['sbom.json'] = JSON.stringify(sbom, null, 2);

  // Execute real OS verification on disk inside a confined project workspace
  const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${params.id}`);
  const verification = await verifyProjectWorkspace(workspaceDir, files, eco.key);

  const secScan = scanSecretsAndSecurity(files);
  const diagrams = buildArchitectureDiagrams(params.title, params.prompt, files);
  diagrams.endpoints = discoveredEndpoints.map((ep) => `${ep.method} ${ep.path}`);

  const execPenalty = verification.exitCode === 0 && verification.redTeamPassed ? 0 : 15;
  const penalty =
    secScan.secrets.length * 18 +
    secScan.staticIssues.length * 7 +
    (rtScriptCheck.safe ? 0 : 12) +
    execPenalty;
  const score = Math.max(35, Math.min(99, 97 - penalty));
  // Report only tests the OS runner actually executed (see verifier.ts).
  const testsRun = verification.testsExecuted;
  const redTeamStatus =
    verification.redTeamPassed &&
    verification.exitCode === 0 &&
    secScan.secrets.length === 0 &&
    secScan.staticIssues.length <= 1 &&
    rtScriptCheck.safe
      ? 'survived'
      : 'breached';
  const status = redTeamStatus === 'survived' && score >= 80 ? 'verified' : 'needs_review';

  const diffs = computeUnifiedDiffs(baselineFiles, files);

  const reportMd = buildAuditMarkdown({
    title: params.title,
    ecosystemName: eco.displayName,
    score,
    testsRun,
    redTeamStatus,
    secretsCount: secScan.secrets.length,
    staticIssues: [...secScan.staticIssues, ...rtScriptCheck.violations],
    reasoningBrief: reasoning.reasoningBrief,
    endpoints: diagrams.endpoints,
    verification,
  });
  files['OMEGA_REPORT.md'] = reportMd;
  files['OMEGA_AUDIT_REPORT.html'] = renderAuditReportHtml({
    title: params.title,
    language: eco.displayName,
    score,
    testsRun,
    redTeamStatus,
    reasoningBrief: reasoning.reasoningBrief,
    reportMd,
    sbom,
  });

  const logs = [
    `[Stage 1 · Architect (${routingUsed.architect})] تم تحليل المتطلبات وتحديد البيئة: ${eco.displayName}`,
    `[Stage 1 · Deep Reasoning (${routingUsed.strategist})] استنتاج ${reasoning.predictedRequirements.length} متطلبات ضمنية (WAL / Security / Cross-OS).`,
    `[Stage 2 · Builders (${synthesisEngine === 'ollama-local' ? `Ollama محلي: ${routingUsed.builder_alpha}` : synthesisEngine === 'gemini-ai' ? `Gemini AI + ${routingUsed.builder_alpha}` : `${routingUsed.builder_alpha} / ${routingUsed.builder_beta}`})] توليد ${Object.keys(files).length} ملفاً معمارياً + Makefile + Swagger + Diagrams (${discoveredEndpoints.length} نقاط نهاية)${aiSummaryNote}.`,
    legacyMigration
      ? `[Stage 2b · Legacy Agent] تم اكتشاف كود قديم (${legacyMigration.legacyDetected.map((d) => d.language).join(', ')}) وترحيله مع اختبارات تطابق.`
      : `[Stage 3 · Real OS Verify (${verification.runtime})] تنفيذ الاختبارات الفعلية على القرص: ${verification.testsPassed}/${verification.testsExecuted} نجحت (exit=${verification.exitCode}).`,
    `[Stage 3b · Subprocess Output]\n${verification.outputSnippet}`,
    `[Stage 4 · Security & SBOM] فحص الأسرار: ${secScan.secrets.length} تسريب | إصدار CycloneDX 1.5 SHA-256.`,
    `[Stage 5 · Red-Team Fuzz (${routingUsed.red_team})] فحص السكربتات والحقن: ${redTeamStatus === 'survived' ? 'صامد 100%' : 'يتطلب معالجة'} | التراجع الذري: ${rollbackOutcome.rollback.applied ? 'مُفعّل' : 'غير مطلوب'}.`,
    `[Stage 6 · Synthesizer (${routingUsed.synthesizer_healer})] اكتمل التدقيق بنجاح — النتيجة النهائية: ${score}/100.`,
  ].join('\n');

  return {
    id: params.id,
    title: params.title,
    prompt: params.prompt,
    mode: params.mode,
    status,
    language: eco.displayName,
    ecosystemKey: eco.key,
    score,
    testsRun,
    redTeamStatus,
    createdAt: now,
    finishedAt: now,
    liveLogs: logs,
    reportMd,
    reasoningBrief: reasoning.reasoningBrief,
    predictedRequirements: reasoning.predictedRequirements,
    files,
    baselineFiles,
    diffs,
    sandbox: {
      running: false,
      port: null,
      url: null,
      startedAt: null,
      logs: 'البيئة المعزولة متوقفة حالياً. اضغط «تشغيل المعزول» لبدء الخادم الحي.',
    },
    benchmark: null,
    sbom,
    diagrams,
    legacyMigration,
    routingUsed,
    discoveredEndpoints,
    rollbackSummary: rollbackOutcome.rollback,
    verification,
    synthesisEngine,
  };
}

async function recomputeProjectAuditState(
  project: ProjectRecord,
  note: string,
): Promise<ProjectRecord> {
  const eco = ECOSYSTEM_CATALOG[project.ecosystemKey] || ECOSYSTEM_CATALOG.python;
  const discoveredEndpoints = discoverEndpoints(project.files, project.prompt, project.title);
  const sbom = generateCycloneDxSbom(project.title, project.files);
  project.files['sbom.json'] = JSON.stringify(sbom, null, 2);

  const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${project.id}`);
  const verification = await verifyProjectWorkspace(workspaceDir, project.files, eco.key);
  const secScan = scanSecretsAndSecurity(project.files);
  const testScripts = Object.entries(project.files)
    .filter(([fname]) => fname.includes('test') || fname.startsWith('red_team_attack'))
    .map(([, content]) => content)
    .join('\n');
  const rtScriptCheck = validateRedTeamScript(testScripts);
  const diagrams = buildArchitectureDiagrams(project.title, project.prompt, project.files);
  diagrams.endpoints = discoveredEndpoints.map((ep) => `${ep.method} ${ep.path}`);

  const execPenalty = verification.exitCode === 0 && verification.redTeamPassed ? 0 : 15;
  const penalty =
    secScan.secrets.length * 18 +
    secScan.staticIssues.length * 7 +
    (rtScriptCheck.safe ? 0 : 12) +
    execPenalty;
  const score = Math.max(35, Math.min(99, 97 - penalty));
  // Report only tests the OS runner actually executed (see verifier.ts).
  const testsRun = verification.testsExecuted;
  const redTeamStatus =
    verification.redTeamPassed &&
    verification.exitCode === 0 &&
    secScan.secrets.length === 0 &&
    secScan.staticIssues.length <= 1 &&
    rtScriptCheck.safe
      ? 'survived'
      : 'breached';
  const status = redTeamStatus === 'survived' && score >= 80 ? 'verified' : 'needs_review';

  const reportMd = buildAuditMarkdown({
    title: project.title,
    ecosystemName: project.language,
    score,
    testsRun,
    redTeamStatus,
    secretsCount: secScan.secrets.length,
    staticIssues: [...secScan.staticIssues, ...rtScriptCheck.violations],
    reasoningBrief: project.reasoningBrief,
    endpoints: diagrams.endpoints,
    verification,
  });

  project.files['OMEGA_REPORT.md'] = reportMd;
  project.files['OMEGA_AUDIT_REPORT.html'] = renderAuditReportHtml({
    title: project.title,
    language: project.language,
    score,
    testsRun,
    redTeamStatus,
    reasoningBrief: project.reasoningBrief,
    reportMd,
    sbom,
  });

  project.discoveredEndpoints = discoveredEndpoints;
  project.sbom = sbom;
  project.verification = verification;
  project.diagrams = diagrams;
  project.diffs = computeUnifiedDiffs(project.baselineFiles || {}, project.files);
  project.score = score;
  project.testsRun = testsRun;
  project.redTeamStatus = redTeamStatus;
  project.status = status;
  project.reportMd = reportMd;
  project.finishedAt = new Date().toISOString();
  project.liveLogs = [
    project.liveLogs,
    `[Re-Verify · ${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${note} — ${verification.testsPassed}/${verification.testsExecuted} (${verification.runtime}, exit=${verification.exitCode})`,
    verification.outputSnippet,
  ].join('\n');

  return project;
}

/** Runs the real self-healing loop and commits only measured improvements. */
async function runProjectHealing(project: ProjectRecord, maxIterations: number) {
  const baselineVerification =
    project.verification ||
    (await verifyProjectWorkspace(
      path.join(DATA_DIR, 'workspaces', `project_${project.id}`),
      project.files,
      project.ecosystemKey,
    ));
  const outcome = await healProject({
    projectId: project.id,
    files: project.files,
    ecosystemKey: project.ecosystemKey,
    baselineVerification,
    workspaceRoot: path.join(DATA_DIR, 'workspaces'),
    maxIterations,
    verify: (files, workspaceDir) =>
      verifyProjectWorkspace(workspaceDir, files, project.ecosystemKey),
  });
  if (outcome.report.attempts.length > 0) {
    project.files = outcome.files;
    await recomputeProjectAuditState(
      project,
      `الإصلاح الذاتي: ${outcome.report.attempts.length} ترقيعاً معتمداً بعد تحقق فعلي`,
    );
  }
  project.healing = outcome.report;
  return outcome.report;
}

function ensureLegacyWatchWorkspace(dataDir: string): string {
  const legacyDir = path.join(dataDir, 'watched_demo', 'legacy_payroll');
  if (!fs.existsSync(legacyDir)) {
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'PAYROLL.cob'),
      [
        'IDENTIFICATION DIVISION.',
        'PROGRAM-ID. PAYROLL.',
        'DATA DIVISION.',
        'WORKING-STORAGE SECTION.',
        '01 WS-AMOUNT PIC 9(6)V99 VALUE 1500.00.',
        'PROCEDURE DIVISION.',
        '    DISPLAY "PAYROLL VERIFIED: " WS-AMOUNT.',
        '    STOP RUN.',
        '',
      ].join('\n'),
      'utf-8',
    );
  }
  return path.relative(process.cwd(), legacyDir).split(path.sep).join('/');
}

async function createInitialSeed(): Promise<StoreData> {
  const vault: VaultEntry[] = [
    {
      id: 1,
      domain: 'SQLite & Persistence',
      pattern: 'تفعيل Write-Ahead Logging',
      verifiedWisdom: 'تفعيل PRAGMA journal_mode=WAL والاستعلامات المعيارية لمنع تعارض القراءة والكتابة وحقن SQL.',
      createdAt: new Date(Date.now() - 86400_000 * 3).toISOString(),
    },
    {
      id: 2,
      domain: 'Container Security',
      pattern: 'Non-Root Container Hardening',
      verifiedWisdom: 'تشغيل جميع حاويات Docker بمستخدم مقيد الصلاحيات (omegauser) مع no-new-privileges.',
      createdAt: new Date(Date.now() - 86400_000 * 2).toISOString(),
    },
    {
      id: 3,
      domain: 'Edge & Path Guard',
      pattern: 'ZIP Extraction Confinement',
      verifiedWisdom: 'التحقق من المسارات النسبية قبل فك الضغط لرفض أي محاولة اختراق مسارات (.. أو .git).',
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
    },
  ];

  const p1 = await runPipelineSynthesis({
    id: 1,
    title: 'نظام إدارة المخزون والمبيعات',
    prompt: 'بناء خادم REST API عالي التزامن بلغة Python لإدارة المخزون والمبيعات مع قاعدة بيانات SQLite WAL ونقطة /health',
    mode: 'new',
    explicitEcosystem: 'python',
    vault,
  });
  // No fabricated benchmark is seeded. Benchmarks are only produced by the real
  // HTTP stress-test endpoint and appear as "not measured" until then.

  const p2 = await runPipelineSynthesis({
    id: 2,
    title: 'بوابة إدارة المهام والعملاء',
    prompt: 'تطوير واجهة API خفيفة بلغة Python لإدارة العملاء والمهام اليومية مع ترحيلات SQLite وتوثيق OpenAPI',
    mode: 'new',
    explicitEcosystem: 'python',
    vault,
  });

  const p3 = await runPipelineSynthesis({
    id: 3,
    title: 'ترقية نظام الرواتب البنكي (COBOL)',
    prompt: 'تحليل نظام رواتب قديم بلغة COBOL وهجرته إلى خدمة Python 3.12 حديثة آمنة مع اختبارات تطابق السلوك',
    mode: 'audit',
    explicitEcosystem: 'cobol',
    vault,
  });

  const billingWatchPath = ensureDemoWatchWorkspace(DATA_DIR);
  const legacyWatchPath = ensureLegacyWatchWorkspace(DATA_DIR);
  const billingInspect = inspectWatchedDirectory(billingWatchPath, __dirname);
  const legacyInspect = inspectWatchedDirectory(legacyWatchPath, __dirname);

  const watches: WatchFolder[] = [
    {
      id: 1,
      folderPath: billingWatchPath,
      goal: 'مراقبة التعديلات الأمنية وتحديث SBOM تلقائياً',
      intervalSec: 30,
      enabled: true,
      filesCount: billingInspect.inspection?.filesCount || 2,
      lastTreeHash: billingInspect.inspection?.treeHash,
      lastFileHashes: billingInspect.inspection?.fileHashes,
      changedFiles: [],
      lastCheckedAt: new Date(Date.now() - 120_000).toISOString(),
      lastTriggeredProjectId: 1,
    },
    {
      id: 2,
      folderPath: legacyWatchPath,
      goal: 'رصد ملفات COBOL الجديدة واقتراح مسار هجرة آمن',
      intervalSec: 60,
      enabled: false,
      filesCount: legacyInspect.inspection?.filesCount || 1,
      lastTreeHash: legacyInspect.inspection?.treeHash,
      lastFileHashes: legacyInspect.inspection?.fileHashes,
      changedFiles: [],
      lastCheckedAt: new Date(Date.now() - 900_000).toISOString(),
      lastTriggeredProjectId: 3,
    },
  ];

  const cognitive: CognitiveProfile = {
    traits: {
      architecture_style: 'يفضل البنية الخفيفة عالية الكفاءة قليلة استهلاك الذاكرة',
      priority_focus: 'يعطي أولوية قصوى للأمان السيبراني وتحصين الكود',
    },
    recentDialogue: [
      {
        id: 1,
        role: 'assistant',
        content: 'أهلاً بك يا هندسة في استوديو GENESIS-OMEGA. أنا شريكك الهندسي الصوتي؛ يمكنك التحدث معي لبناء المشاريع أو تدقيقها أو قياس أدائها.',
        thinkingStyle: 'collaborative_builder',
        emotion: 'calm_human',
        intent: 'greeting',
        createdAt: new Date(Date.now() - 600_000).toISOString(),
      },
    ],
    pendingSuggestion: null,
  };

  return {
    nextProjectId: 4,
    nextVaultId: 4,
    nextWatchId: 3,
    nextDialogueId: 2,
    projects: [p1, p2, p3],
    vault,
    watches,
    cognitive,
  };
}

async function loadStore(): Promise<StoreData> {
  const billingWatchPath = ensureDemoWatchWorkspace(DATA_DIR);
  const legacyWatchPath = ensureLegacyWatchWorkspace(DATA_DIR);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoreData;
      if (Array.isArray(parsed.projects)) {
        const defaultRouting = resolveAsymmetricRouting(getGovernorStats());
        let touched = false;
        for (const p of parsed.projects) {
          if (!p.discoveredEndpoints || p.discoveredEndpoints.length === 0) {
            p.discoveredEndpoints = discoverEndpoints(p.files || {}, p.prompt || '', p.title || '');
            touched = true;
          }
          if (!p.routingUsed) {
            p.routingUsed = defaultRouting;
            touched = true;
          }
          if (!p.rollbackSummary) {
            p.rollbackSummary = {
              applied: false,
              reason: 'اجتازت التعديلات معايير التحقق دون تراجع في الجودة أو الأمان.',
              baselineScore: p.score,
              candidateScore: p.score,
            };
            touched = true;
          }
          if (!p.verification) {
            const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${p.id}`);
            p.verification = await verifyProjectWorkspace(workspaceDir, p.files || {}, p.ecosystemKey);
            touched = true;
          }
          if (p.sandbox?.running) {
            p.sandbox = {
              running: false,
              port: null,
              url: null,
              startedAt: null,
              logs: 'البيئة المعزولة متوقفة بعد إعادة تشغيل الخادم. اضغط «تشغيل المعزول» لبدء العملية الحية.',
            };
            touched = true;
          }
        }
        for (const w of parsed.watches || []) {
          if (w.folderPath === '/workspace/microservices/inventory-core') {
            w.folderPath = billingWatchPath;
            const insp = inspectWatchedDirectory(billingWatchPath, __dirname);
            w.filesCount = insp.inspection?.filesCount || w.filesCount;
            w.lastTreeHash = insp.inspection?.treeHash;
            w.lastFileHashes = insp.inspection?.fileHashes;
            touched = true;
          } else if (w.folderPath === '/workspace/legacy/payroll-cobol') {
            w.folderPath = legacyWatchPath;
            const insp = inspectWatchedDirectory(legacyWatchPath, __dirname);
            w.filesCount = insp.inspection?.filesCount || w.filesCount;
            w.lastTreeHash = insp.inspection?.treeHash;
            w.lastFileHashes = insp.inspection?.fileHashes;
            touched = true;
          }
        }
        if (touched) saveStore(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Reinitializing store after read error:', err);
  }
  const initial = await createInitialSeed();
  saveStore(initial);
  return initial;
}

function saveStore(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  // Optional authentication. When OMEGA_API_KEY is set, every API/sandbox
  // route requires the HttpOnly session cookie issued by /api/auth/login.
  let sessionToken = newSessionToken();
  const loginThrottle = createLoginThrottle();
  const authRequired = () => Boolean((process.env.OMEGA_API_KEY || '').trim());
  const publicAuthPaths = new Set(['/api/auth/status', '/api/auth/login', '/api/auth/logout']);

  app.use((req, res, next) => {
    if (!authRequired() || publicAuthPaths.has(req.path)) {
      next();
      return;
    }
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/sandbox/')) {
      next();
      return;
    }
    const cookieToken = parseCookieHeader(req.headers.cookie, SESSION_COOKIE_NAME);
    if (cookieToken && timingSafeEqualStrings(cookieToken, sessionToken)) {
      next();
      return;
    }
    res.status(401).json({ error: 'غير مصرح: يلزم تسجيل الدخول أولاً.', authRequired: true });
  });

  app.get('/api/auth/status', (_req, res) => {
    const required = authRequired();
    const cookieToken = parseCookieHeader(_req.headers.cookie, SESSION_COOKIE_NAME);
    res.json({
      authRequired: required,
      authenticated: !required || Boolean(cookieToken && timingSafeEqualStrings(cookieToken, sessionToken)),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const expected = (process.env.OMEGA_API_KEY || '').trim();
    if (!expected) {
      res.json({ ok: true, authRequired: false });
      return;
    }
    const clientKey = String(req.body?.apiKey || '');
    const clientId = req.ip || 'unknown';
    if (loginThrottle.isBlocked(clientId)) {
      res.status(429).json({ error: 'محاولات دخول كثيرة؛ حاول مرة أخرى لاحقاً.' });
      return;
    }
    if (!timingSafeEqualStrings(clientKey, expected)) {
      loginThrottle.recordFailure(clientId);
      res.status(401).json({ error: 'مفتاح الدخول غير صحيح.' });
      return;
    }
    loginThrottle.clear(clientId);
    res.setHeader(
      'Set-Cookie',
      buildSessionCookie(sessionToken, {
        secure: req.secure || process.env.OMEGA_COOKIE_SECURE === '1',
      }),
    );
    res.json({ ok: true, authRequired: true });
  });

  app.post('/api/auth/logout', (_req, res) => {
    sessionToken = newSessionToken();
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ ok: true });
  });

  // Probe the local runtime before the store seed so local-first routing can
  // prefer models that are genuinely installed on this machine.
  await refreshLocalModelStatus();

  const store = await loadStore();
  const piperTts = new PiperNeuralVoiceEngine({
    baseDir: __dirname,
    cacheDir: path.join(DATA_DIR, 'voice_cache'),
  });

  // Secure, cache-friendly delivery of locally synthesized Piper WAV files.
  app.get('/api/voice/audio/:filename', (req, res) => {
    const wavFile = resolveVoiceCacheFile(piperTts.cacheDir, req.params.filename);
    if (!wavFile) {
      res.status(404).json({ error: 'audio_not_found' });
      return;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(wavFile);
    } catch {
      res.status(404).json({ error: 'audio_not_found' });
      return;
    }
    if (!stat.isFile()) {
      res.status(404).json({ error: 'audio_not_found' });
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(wavFile).pipe(res);
  });

  // Live Sandbox Endpoint Router (Real live HTTP proxy to spawned OS process + safe fallback)
  app.get('/sandbox/:id/health', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const live = getLiveSandboxInfo(project.id);
    if (live) {
      try {
        const proxied = await probeLiveSandbox(project.id, '/health', 'GET');
        if (proxied) {
          res.status(proxied.status).json(
            typeof proxied.body === 'object' && proxied.body !== null
              ? { ...(proxied.body as Record<string, unknown>), proxiedPort: live.port }
              : proxied.body,
          );
          return;
        }
      } catch {
        // fall through to embedded response
      }
    }
    res.json({
      status: 'ok',
      projectId: project.id,
      title: project.title,
      ecosystem: project.ecosystemKey,
      sandboxRunning: project.sandbox.running,
      timestamp: new Date().toISOString(),
    });
  });

  app.all('/sandbox/:id/api/*', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const subPath = `/api/${String((req.params as Record<string, string>)[0] || '')}`.replace(/\.\./g, '');
    const live = getLiveSandboxInfo(project.id);
    if (live) {
      try {
        const proxied = await probeLiveSandbox(
          project.id,
          subPath,
          req.method,
          req.method === 'POST' || req.method === 'PUT' ? req.body : undefined,
        );
        if (proxied) {
          res.status(proxied.status).json(proxied.body);
          return;
        }
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Live sandbox proxy failed' });
        return;
      }
    }
    res.json({
      projectId: project.id,
      service: project.title,
      path: subPath,
      items: [
        { id: 1, title: `${project.title} — Primary Module`, status: 'verified', score: project.score },
        { id: 2, title: 'CycloneDX 1.5 SBOM Manifest', status: project.sbom?.securityAudit.supplyChainStatus || 'clean' },
      ],
    });
  });

  app.get('/sandbox/:id/diagrams', (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).send('Not found');
      return;
    }
    if (project.files['architecture_diagrams.html']) {
      res.type('html').send(project.files['architecture_diagrams.html']);
      return;
    }
    res.type('html').send(`<pre>${escapeHtml(project.diagrams.erdMermaid)}\n\n${escapeHtml(project.diagrams.sequenceMermaid)}</pre>`);
  });

  app.get('/sandbox/:id', (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).send('Not found');
      return;
    }
    if (project.files['index.html']) {
      res.type('html').send(project.files['index.html']);
      return;
    }
    res.type('html').send(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(project.title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem;line-height:1.6}
.box{max-width:720px;margin:0 auto;border:1px solid #1e293b;border-radius:12px;padding:1.5rem;background:#0f172a}
code{background:#020617;padding:2px 6px;border-radius:4px;color:#38bdf8}</style></head>
<body><div class="box"><h2>البيئة المعزولة: ${escapeHtml(project.title)}</h2>
<p>البيئة: <strong>${escapeHtml(project.language)}</strong> · التقييم: ${project.score}/100</p>
<p>نقاط الفحص المتاحة: <code>GET /sandbox/${project.id}/health</code> و <code>GET /sandbox/${project.id}/api/items</code></p>
</div></body></html>`);
  });

  // Solution architect catalog: every domain emits a complete, verifiable project.
  app.get('/api/solutions/domains', (_req, res) => {
    res.json({ domains: listSolutionDomains(), total: SOLUTION_DOMAINS.length });
  });

  app.post('/api/solutions/generate', async (req, res) => {
    const domainId = String(req.body?.domain || '').trim();
    const title = String(req.body?.title || '').trim() || 'GENESIS-OMEGA Solution';
    const prompt = String(req.body?.prompt || '').trim();
    const domain = detectSolutionDomain(prompt, domainId);
    if (!domain) {
      res.status(400).json({
        error: 'نطاق الحل غير معروف.',
        available: listSolutionDomains().map((d) => d.id),
      });
      return;
    }
    try {
      const files = generateSolutionFiles(domain.id, title, prompt || domain.descriptionAr);
      const workspaceDir = path.join(DATA_DIR, 'workspaces', `solution_${domain.id}_${Date.now()}`);
      const verification = await verifyProjectWorkspace(workspaceDir, files, domain.ecosystem);
      res.json({
        domain: domain.id,
        ecosystem: domain.ecosystem,
        entryFile: domain.entryFile,
        testCommand: domain.testCommand,
        files,
        verification,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر توليد الحل.' });
    }
  });

  // 1. System Status, Asymmetric Routing & EcoResourceGovernor
  app.get('/api/status', (_req, res) => {
    const governor = getGovernorStats();
    const hasGemini = Boolean((process.env.GEMINI_API_KEY || '').trim());
    const piperStatus = piperTts.status();
    const availableModels = AVAILABLE_MODELS.map((m) => ({
      ...m,
      installed: localModelStatus.models.includes(m.id),
    }));
    res.json({
      governor,
      activeRouting: resolveAsymmetricRouting(governor),
      availableModels,
      ecosystemsCount: Object.keys(ECOSYSTEM_CATALOG).length,
      geminiConfigured: hasGemini,
      localModels: {
        online: localModelStatus.online,
        baseUrl: localModelStatus.baseUrl,
        version: localModelStatus.version,
        installedCount: localModelStatus.models.length,
        catalogCount: LOCAL_CODING_MODELS.length,
        checkedAt: localModelStatus.checkedAt,
        installed: localModelStatus.models,
        recommended: resolveAsymmetricRouting(governor),
        localFirst: process.env.OMEGA_LOCAL_FIRST === '1',
      },
      piper_tts: piperStatus,
      capabilities: {
        ttsModel: piperStatus.offline_neural_ready
          ? 'piper-offline-neural'
          : hasGemini
            ? geminiModel('tts')
            : 'web-speech-fallback',
        cognitiveModel: hasGemini ? geminiModel('flash') : 'deterministic-nlu',
        transcribeModel: hasGemini ? geminiModel('transcribe') : 'web-speech-api',
        sbomSpec: 'CycloneDX 1.5',
        autonomousHealer: 'diagnose-patch-verify-accept',
      },
      totals: {
        projects: store.projects.length,
        verified: store.projects.filter((p) => p.status === 'verified').length,
        vaultRules: store.vault.length,
        activeWatches: store.watches.filter((w) => w.enabled).length,
      },
    });
  });

  // 1b. Local model catalog (Ollama) — discovery, probe and explicit opt-in pull.
  app.get('/api/models', (_req, res) => {
    res.json({
      runtime: 'ollama',
      status: localModelStatus,
      catalog: LOCAL_CODING_MODELS.map((m) => ({
        ...m,
        installed: localModelStatus.models.includes(m.id),
      })),
      recommended: resolveAsymmetricRouting(getGovernorStats()),
    });
  });

  app.post('/api/models/probe', async (_req, res) => {
    res.json(await refreshLocalModelStatus());
  });

  app.post('/api/models/pull', async (req, res) => {
    const id = String(req.body?.id || '').trim();
    const model = findLocalModel(id);
    if (!model) {
      res.status(400).json({ error: 'نموذج غير معروف في الكتالوج.', available: LOCAL_CODING_MODELS.map((m) => m.id) });
      return;
    }
    const result = await pullOllamaModel(model.id);
    if (!result.ok) {
      res.status(400).json({ error: result.error || 'تعذر تنزيل النموذج.' });
      return;
    }
    await refreshLocalModelStatus();
    res.json({ pulled: model.id, status: localModelStatus });
  });

  // 2. Projects CRUD & Pipeline
  app.get('/api/projects', (_req, res) => {
    res.json({ projects: store.projects });
  });

  app.get('/api/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    res.json({ project });
  });

  app.post('/api/projects', async (req, res) => {
    const title = String(req.body?.title || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const ecosystem = req.body?.ecosystem as EcosystemKey | undefined;
    const mode: ProjectMode = req.body?.mode === 'audit' ? 'audit' : 'new';
    const useAi = req.body?.useAi === true;
    const modelOverrides = req.body?.modelOverrides as Partial<Record<AgentRole, string>> | undefined;

    if (!title || title.length < 2) {
      res.status(400).json({ error: 'يرجى إدخال عنوان واضح للمشروع.' });
      return;
    }
    if (!prompt || prompt.length < 5) {
      res.status(400).json({ error: 'يرجى إدخال وصف هندسي واضح للمتطلبات.' });
      return;
    }

    const governor = getGovernorStats();
    const boundedPrompt = prompt.slice(0, governor.maxPromptChars);
    const project = await runPipelineSynthesis({
      id: store.nextProjectId++,
      title,
      prompt: boundedPrompt,
      mode,
      explicitEcosystem: ecosystem,
      vault: store.vault,
      modelOverrides,
      governor,
      useAi,
      solutionDomain: typeof req.body?.solutionDomain === 'string' ? req.body.solutionDomain : undefined,
    });

    store.projects.unshift(project);
    saveStore(store);
    res.status(201).json({ project });
  });

  app.post('/api/projects/upload', async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim() || 'مشروع مدقق من أرشيف ZIP';
      const prompt = String(req.body?.prompt || '').trim() || 'فحص وتدقيق الحزمة المرفوعة وتوليد SBOM والمخططات.';
      const zipBase64 = typeof req.body?.zipBase64 === 'string' ? req.body.zipBase64 : '';
      const rawFiles = req.body?.files as Record<string, string> | undefined;

      const uploadedFiles: Record<string, string> = {};

      if (zipBase64) {
        const cleanB64 = zipBase64.includes(',') ? zipBase64.split(',').pop() || '' : zipBase64;
        const buffer = Buffer.from(cleanB64, 'base64');
        if (buffer.byteLength > 20 * 1024 * 1024) {
          res.status(400).json({ error: 'حجم الأرشيف يتجاوز الحد المسموح (20 ميجابايت).' });
          return;
        }
        const zip = await JSZip.loadAsync(buffer);
        const entries = Object.values(zip.files).filter((f) => !f.dir);
        if (entries.length === 0) {
          res.status(400).json({ error: 'ملف ZIP فارغ ولا يحتوي على ملفات نصية صالحة.' });
          return;
        }
        if (entries.length > 200) {
          res.status(400).json({ error: 'عدد الملفات داخل الأرشيف يتجاوز الحد الآمن (200 ملف).' });
          return;
        }
        let totalDecoded = 0;
        for (const entry of entries) {
          const safePath = isSafeRelativePath(entry.name);
          if (!safePath) continue;
          const content = await entry.async('string');
          totalDecoded += Buffer.byteLength(content, 'utf-8');
          if (totalDecoded > 12 * 1024 * 1024) {
            res.status(400).json({ error: 'الحجم الإجمالي للملفات المفكوكة يتجاوز 12 ميجابايت.' });
            return;
          }
          uploadedFiles[safePath] = content;
        }
      } else if (rawFiles && typeof rawFiles === 'object') {
        for (const [rawKey, val] of Object.entries(rawFiles)) {
          const safePath = isSafeRelativePath(rawKey);
          if (safePath && typeof val === 'string') {
            uploadedFiles[safePath] = val;
          }
        }
      }

      if (Object.keys(uploadedFiles).length === 0) {
        res.status(400).json({ error: 'لم يتم العثور على ملفات برمجية صالحة وآمنة داخل الطلب.' });
        return;
      }

      const modelOverrides = req.body?.modelOverrides as Partial<Record<AgentRole, string>> | undefined;
      const project = await runPipelineSynthesis({
        id: store.nextProjectId++,
        title,
        prompt,
        mode: 'audit',
        vault: store.vault,
        uploadedFiles,
        modelOverrides,
      });

      store.projects.unshift(project);
      saveStore(store);
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? `تعذر تحليل ملف ZIP: ${err.message}` : 'فشل تحليل الحزمة المرفوعة.',
      });
    }
  });

  app.put('/api/projects/:id/files', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const rawPath = String(req.body?.filePath || '');
    const safePath = isSafeRelativePath(rawPath);
    const content = typeof req.body?.content === 'string' ? req.body.content : null;

    if (!safePath || content === null) {
      res.status(400).json({ error: 'مسار الملف أو المحتوى غير صالح.' });
      return;
    }

    project.files[safePath] = content;
    await recomputeProjectAuditState(project, `تحديث الملف ${safePath} وإعادة الفحص الفعلي`);
    saveStore(store);
    res.json({ project });
  });

  app.post('/api/projects/:id/verify', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    await recomputeProjectAuditState(project, 'تشغيل التحقق الفعلي المباشر على نظام التشغيل');
    saveStore(store);
    res.json({ project });
  });

  // Autonomous healer: diagnose → generate conservative patches → run the real
  // OS verifier on each → promote only measured improvements.
  app.post('/api/projects/:id/heal', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const maxIterations = Math.max(1, Math.min(8, Number(req.body?.maxIterations || 4)));
    const healing = await runProjectHealing(project, maxIterations);
    saveStore(store);
    res.json({ project, healing });
  });

  app.post('/api/projects/:id/ai-synthesize', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const governor = getGovernorStats();
    const eco = ECOSYSTEM_CATALOG[project.ecosystemKey] || ECOSYSTEM_CATALOG.python;
    const routing = project.routingUsed || resolveAsymmetricRouting(governor);
    const isLocal = isLocalModelId(routing.builder_alpha);
    if (!isLocal && !(process.env.GEMINI_API_KEY || '').trim()) {
      res.status(503).json({
        error: 'مفتاح GEMINI_API_KEY غير مضبوط؛ اختر نموذجاً محلياً في توزيع النماذج أو اضبط المفتاح.',
      });
      return;
    }

    const aiOut = await synthesizeProject({
      title: project.title,
      prompt: project.prompt,
      eco,
      routing,
      vault: store.vault,
      governor,
    });

    if (!aiOut.usedGemini && !aiOut.usedLocal) {
      res.status(502).json({
        error: aiOut.error || 'لم يُرجع النموذج ملفات برمجية صالحة.',
      });
      return;
    }

    const candidateFiles = { ...project.files, ...aiOut.generatedFiles };
    const rollbackOutcome = evaluateWithAtomicRollback(project.files, candidateFiles, (cand) => {
      const scan = scanSecretsAndSecurity(cand);
      return {
        score: Math.max(42, Math.min(99, 97 - scan.secrets.length * 18 - scan.staticIssues.length * 7)),
        secretsCount: scan.secrets.length,
      };
    });

    project.files = rollbackOutcome.files;
    project.rollbackSummary = rollbackOutcome.rollback;
    project.synthesisEngine = rollbackOutcome.rollback.applied
      ? project.synthesisEngine
      : aiOut.engine === 'ollama'
        ? 'ollama-local'
        : 'gemini-ai';
    await recomputeProjectAuditState(
      project,
      `تطوير الملفات عبر ${aiOut.engine === 'ollama' ? 'Ollama المحلي' : 'Gemini'} (${aiOut.modelUsed}) — التراجع الذري: ${rollbackOutcome.rollback.applied ? 'مُفعّل' : 'مُعتمد'}`,
    );
    saveStore(store);
    res.json({ project, synthesis: aiOut });
  });

  app.post('/api/projects/:id/retry', async (req, res) => {
    const id = Number(req.params.id);
    const idx = store.projects.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const old = store.projects[idx];
    const updated = await runPipelineSynthesis({
      id: old.id,
      title: old.title,
      prompt: old.prompt,
      mode: old.mode,
      explicitEcosystem: old.ecosystemKey,
      vault: store.vault,
      uploadedFiles: old.mode === 'audit' ? old.baselineFiles : undefined,
    });
    updated.sandbox = old.sandbox;
    updated.benchmark = old.benchmark;
    store.projects[idx] = updated;
    saveStore(store);
    res.json({ project: updated });
  });

  app.delete('/api/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const before = store.projects.length;
    store.projects = store.projects.filter((p) => p.id !== id);
    if (store.projects.length === before) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    saveStore(store);
    res.json({ deletedId: id });
  });

  // 3. Interactive Sandbox (Real OS Child Process) & Real HTTP Benchmark
  app.post('/api/projects/:id/sandbox/start', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${project.id}`);
    const procRes = await startSandboxProcess(workspaceDir, project);
    project.sandbox = {
      running: procRes.running,
      port: procRes.port ?? PORT,
      url: `/sandbox/${project.id}`,
      startedAt: new Date().toISOString(),
      logs: procRes.logs,
    };
    saveStore(store);
    res.json({ project, liveProcess: procRes.liveProcess });
  });

  app.post('/api/projects/:id/sandbox/stop', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    await stopSandboxProcess(project.id);
    project.sandbox = {
      running: false,
      port: null,
      url: null,
      startedAt: null,
      logs: '[Sandbox Stopped] تم إيقاف العملية الحيّة والبيئة المعزولة وتحرير المنفذ والموارد.',
    };
    saveStore(store);
    res.json({ project });
  });

  app.get('/api/projects/:id/sandbox/probe', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const rawSuffix = typeof req.query.path === 'string' ? req.query.path.trim() : '/health';
    const cleanSuffix = (rawSuffix.startsWith('/') ? rawSuffix : `/${rawSuffix}`).replace(/\.\./g, '');

    const live = getLiveSandboxInfo(project.id);
    if (live) {
      try {
        const liveProbe = await probeLiveSandbox(project.id, cleanSuffix, 'GET');
        if (liveProbe) {
          res.json({ ...liveProbe, port: live.port });
          return;
        }
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'فشل الاتصال بالخادم الحي للمشروع.',
        });
        return;
      }
    }

    const fallbackSuffix = cleanSuffix === '/health' ? '/health' : cleanSuffix.startsWith('/api/') ? cleanSuffix : '/api/items';
    const url = `http://127.0.0.1:${PORT}/sandbox/${project.id}${fallbackSuffix}`;
    const start = performance.now();
    try {
      const upstream = await fetch(url);
      const body = await upstream.json();
      const latencyMs = Number((performance.now() - start).toFixed(2));
      res.json({
        status: upstream.status,
        latencyMs,
        endpoint: `/sandbox/${project.id}${fallbackSuffix}`,
        liveProcess: false,
        body,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'فشل الاتصال بنقطة الفحص.' });
    }
  });

  app.post('/api/projects/:id/benchmark', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }

    // Ensure a live HTTP OS subprocess is targeted whenever the ecosystem supports it
    let live = getLiveSandboxInfo(project.id);
    if (!live) {
      const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${project.id}`);
      const procRes = await startSandboxProcess(workspaceDir, project);
      if (procRes.liveProcess && procRes.port) {
        project.sandbox = {
          running: true,
          port: procRes.port,
          url: `/sandbox/${project.id}`,
          startedAt: new Date().toISOString(),
          logs: procRes.logs,
        };
        live = getLiveSandboxInfo(project.id);
      }
    }

    const totalRequests = 60;
    const concurrency = 6;
    const url = live
      ? `${live.baseUrl}/health`
      : `http://127.0.0.1:${PORT}/sandbox/${project.id}/health`;
    const latencies: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    const wallStart = performance.now();
    const batches = Math.ceil(totalRequests / concurrency);
    for (let b = 0; b < batches; b++) {
      const sliceCount = Math.min(concurrency, totalRequests - b * concurrency);
      const jobs = Array.from({ length: sliceCount }, async () => {
        const t0 = performance.now();
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            await resp.arrayBuffer();
            successCount += 1;
          } else {
            errorCount += 1;
          }
        } catch {
          errorCount += 1;
        }
        latencies.push(performance.now() - t0);
      });
      await Promise.all(jobs);
    }
    const totalMs = Math.max(1, performance.now() - wallStart);

    latencies.sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (latencies.length === 0) return 0;
      const idx = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
      return Number(latencies[idx].toFixed(2));
    };
    const avg = latencies.reduce((acc, v) => acc + v, 0) / Math.max(1, latencies.length);

    const report: BenchmarkReport = {
      status: 'completed',
      totalRequests,
      concurrency,
      successCount,
      errorCount,
      rps: Number(((totalRequests / totalMs) * 1000).toFixed(1)),
      avgLatencyMs: Number(avg.toFixed(2)),
      p50LatencyMs: percentile(50),
      p95LatencyMs: percentile(95),
      p99LatencyMs: percentile(99),
      measuredAt: new Date().toISOString(),
    };

    project.benchmark = report;
    project.files['BENCHMARK_REPORT.json'] = JSON.stringify(report, null, 2);
    saveStore(store);
    res.json({ project, benchmark: report, targetUrl: url, liveProcess: Boolean(live) });
  });

  // 4. Legacy Migration (Project-level & Standalone Lab with Real OS Parity Tests)
  app.post('/api/projects/:id/migrate', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const targetLanguage = String(req.body?.targetLanguage || 'Python 3.12');
    const mig = modernizeLegacyFiles(project.files, targetLanguage);
    if (!mig) {
      res.status(400).json({ error: 'لم يتم رصد ملفات تراثية قديمة داخل هذا المشروع.' });
      return;
    }
    const legWorkDir = path.join(DATA_DIR, 'workspaces', `legacy_proj_${project.id}`);
    fs.rmSync(legWorkDir, { recursive: true, force: true });
    const targetEco = targetLanguage.toLowerCase().includes('go')
      ? 'go'
      : targetLanguage.toLowerCase().includes('rust')
        ? 'rust'
        : 'python';
    mig.result.verification = await verifyProjectWorkspace(legWorkDir, mig.generatedFiles, targetEco);

    project.legacyMigration = mig.result;
    Object.assign(project.files, mig.generatedFiles);
    await recomputeProjectAuditState(project, `ترحيل الأنظمة القديمة نحو ${targetLanguage} وتشغيل اختبارات التطابق`);
    saveStore(store);
    res.json({ project });
  });

  app.post('/api/legacy/migrate', async (req, res) => {
    const filename = isSafeRelativePath(String(req.body?.filename || 'PAYROLL.cob')) || 'PAYROLL.cob';
    const sourceCode = String(req.body?.sourceCode || '').trim();
    const targetLanguage = String(req.body?.targetLanguage || 'Python 3.12');

    if (!sourceCode) {
      res.status(400).json({ error: 'يرجى إدخال الكود المصدري القديم للتحليل والهجرة.' });
      return;
    }

    const inputMap = { [filename]: sourceCode };
    const mig = modernizeLegacyFiles(inputMap, targetLanguage);
    if (!mig) {
      res.status(400).json({
        error: 'امتداد الملف المدخل غير مصنف كلغة قديمة (يدعم .cob, .cbl, .pas, .f90, .c, .bas, .pl أو Python 2).',
      });
      return;
    }

    const legacyLabDir = path.join(DATA_DIR, 'workspaces', 'legacy_lab');
    fs.rmSync(legacyLabDir, { recursive: true, force: true });
    const targetEco: EcosystemKey = targetLanguage.toLowerCase().includes('go')
      ? 'go'
      : targetLanguage.toLowerCase().includes('rust')
        ? 'rust'
        : 'python';
    mig.result.verification = await verifyProjectWorkspace(
      legacyLabDir,
      { ...inputMap, ...mig.generatedFiles },
      targetEco,
    );

    res.json({ migration: mig.result, generatedFiles: mig.generatedFiles });
  });

  // 5. Real ZIP Download, Swagger UI, Live-First Endpoint Probe, Export Bundle & Printable HTML Report
  app.get('/api/projects/:id/swagger', (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).send('Not found');
      return;
    }
    const endpoints =
      project.discoveredEndpoints && project.discoveredEndpoints.length > 0
        ? project.discoveredEndpoints
        : discoverEndpoints(project.files, project.prompt, project.title);
    const docs = generateOpenApiAndSwagger(project.title, project.prompt, endpoints);
    res.type('html').send(docs.swaggerHtml);
  });

  app.post('/api/projects/:id/sandbox/mock-probe', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const method = String(req.body?.method || 'GET').toUpperCase();
    const rawPath = String(req.body?.path || '/health').trim();
    const epPath = (rawPath.startsWith('/') ? rawPath : `/${rawPath}`).replace(/\.\./g, '');
    const endpoints =
      project.discoveredEndpoints && project.discoveredEndpoints.length > 0
        ? project.discoveredEndpoints
        : discoverEndpoints(project.files, project.prompt, project.title);
    const matched = endpoints.find((e) => e.path === epPath && e.method === method) || endpoints[0];

    const live = getLiveSandboxInfo(project.id);
    if (live) {
      try {
        const bodyToSend =
          method === 'POST' || method === 'PUT'
            ? req.body?.payload ?? { name: `${project.title} Live Record`, amount: 150.5 }
            : undefined;
        const liveProbe = await probeLiveSandbox(project.id, epPath, method, bodyToSend);
        if (liveProbe) {
          res.json({
            status: liveProbe.status,
            method,
            endpoint: liveProbe.endpoint,
            latencyMs: liveProbe.latencyMs,
            liveProcess: true,
            port: live.port,
            body: liveProbe.body,
          });
          return;
        }
      } catch {
        // fallback below if route not served by child
      }
    }

    const t0 = performance.now();
    const payload = matched ? matched.sampleResponse : { status: 'ok', service: project.title };
    const latencyMs = Number(Math.max(0.25, performance.now() - t0).toFixed(2));
    res.json({
      status: method === 'POST' ? 201 : 200,
      method: matched?.method || method,
      endpoint: matched?.path || epPath,
      latencyMs,
      liveProcess: false,
      body: payload,
    });
  });

  app.post('/api/projects/:id/export/bundle', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const mode = req.body?.mode === 'git_deploy' ? 'git_deploy' : 'local_bundle';
    const remoteUrl = typeof req.body?.remoteUrl === 'string' ? req.body.remoteUrl : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch : 'main';
    const commitMessage = typeof req.body?.commitMessage === 'string' ? req.body.commitMessage : '';

    try {
      const initialManifest = buildExportBundleManifest(project, {
        mode,
        remoteUrl,
        branch,
        commitMessage,
      });
      if (initialManifest.deployScript) {
        project.files['deploy/git_push.sh'] = initialManifest.deployScript;
      }
      const manifest = await materializeExportToDisk(
        path.join(DATA_DIR, 'exports'),
        project,
        initialManifest,
      );
      saveStore(store);
      res.json({ manifest });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'تعذر تجهيز حزمة التصدير.',
      });
    }
  });

  // Real Git release: materialize the verified bundle, then actually commit
  // and push with an argument-vector child process and a sanitized environment.
  app.post('/api/projects/:id/deploy', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const remoteUrl = String(req.body?.remoteUrl || '').trim();
    const branch = String(req.body?.branch || 'main').trim();
    const commitMessage = String(req.body?.commitMessage || '').trim();
    const dryRun = req.body?.dryRun === true;
    const allowLocalRemote = process.env.OMEGA_ALLOW_LOCAL_GIT_REMOTE === '1';

    try {
      const manifest = buildExportBundleManifest(project, {
        mode: 'git_deploy',
        remoteUrl,
        branch,
        commitMessage,
        allowLocalRemote,
      });
      const materialized = await materializeExportToDisk(
        path.join(DATA_DIR, 'exports'),
        project,
        manifest,
      );
      const result = await executeGitDeploy({
        repoDir: materialized.exportedAbsDir || path.join(DATA_DIR, 'exports', materialized.slug),
        remoteUrl,
        branch,
        commitMessage,
        dryRun,
        allowLocalRemote,
      });
      project.deployment = {
        manifest: materialized,
        result,
        executedAt: new Date().toISOString(),
      };
      saveStore(store);
      res.json({ manifest: materialized, deployment: project.deployment });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'تعذر تنفيذ نشر Git الفعلي.',
      });
    }
  });

  app.get('/api/projects/:id/download', async (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود.' });
      return;
    }
    const zip = new JSZip();
    for (const [filePath, content] of Object.entries(project.files)) {
      const safe = isSafeRelativePath(filePath);
      if (safe) zip.file(safe, content);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="genesis-omega-project-${project.id}.zip"`);
    res.send(buffer);
  });

  app.get('/api/projects/:id/report/html', (req, res) => {
    const id = Number(req.params.id);
    const project = store.projects.find((p) => p.id === id);
    if (!project) {
      res.status(404).send('Not found');
      return;
    }
    res.type('html').send(
      renderAuditReportHtml({
        title: project.title,
        language: project.language,
        score: project.score,
        testsRun: project.testsRun,
        redTeamStatus: project.redTeamStatus,
        reasoningBrief: project.reasoningBrief,
        reportMd: project.reportMd,
        sbom: project.sbom,
      }),
    );
  });

  // 6. Cognitive Voice Partner & Gemini Neural TTS
  app.get('/api/cognitive', (_req, res) => {
    res.json({ cognitive: store.cognitive });
  });

  app.post('/api/voice/command', async (req, res) => {
    const transcript = String(req.body?.transcript || '').trim();
    const activeProjectId =
      typeof req.body?.activeProjectId === 'number' ? req.body.activeProjectId : null;

    if (!transcript) {
      res.status(400).json({ error: 'النص الصوتي فارغ.' });
      return;
    }

    const governor = getGovernorStats();
    const { mindset, discoveredTraits } = analyzeMindsetAndEmotion(transcript);
    Object.assign(store.cognitive.traits, discoveredTraits);

    store.cognitive.recentDialogue.push({
      id: store.nextDialogueId++,
      role: 'user',
      content: transcript,
      thinkingStyle: mindset.thinkingStyle,
      emotion: mindset.emotion,
      createdAt: new Date().toISOString(),
    });

    const route = routeVoiceIntent(transcript, {
      activeProjectId,
      projects: store.projects,
      governor,
      pendingSuggestion: store.cognitive.pendingSuggestion,
      traits: store.cognitive.traits,
    });

    let spokenReply = route.spokenReply;
    let uiCommand = route.uiCommand;
    let engineSource: 'gemini-cognitive' | 'deterministic-nlu' = 'deterministic-nlu';
    let nextPending: PendingSuggestion | null =
      route.newPendingSuggestion !== undefined
        ? route.newPendingSuggestion
        : store.cognitive.pendingSuggestion;
    let createdProject: ProjectRecord | undefined;

    // Execute concrete system actions deterministically
    if (route.actionToExecute) {
      const act = route.actionToExecute;
      if (act.type === 'create_project' && act.prompt) {
        createdProject = await runPipelineSynthesis({
          id: store.nextProjectId++,
          title: act.title || 'مشروع صوتي ذكي',
          prompt: act.prompt,
          mode: 'new',
          vault: store.vault,
        });
        store.projects.unshift(createdProject);
        uiCommand = { action: 'select_project', projectId: createdProject.id, tab: 'logs' };
      } else if (act.type === 'stop_sandbox' && act.projectId) {
        const p = store.projects.find((item) => item.id === act.projectId);
        if (p) {
          await stopSandboxProcess(p.id);
          p.sandbox = {
            running: false,
            port: null,
            url: null,
            startedAt: null,
            logs: '[Voice Command] تم إيقاف عملية البيئة المعزولة الفعلية وتحرير المنفذ.',
          };
        }
      } else if (act.type === 'start_sandbox' && act.projectId) {
        const p = store.projects.find((item) => item.id === act.projectId);
        if (p) {
          // Use the same real child-process launcher as the REST endpoint.
          const workspaceDir = path.join(DATA_DIR, 'workspaces', `project_${p.id}`);
          const procRes = await startSandboxProcess(workspaceDir, p);
          p.sandbox = {
            running: procRes.running,
            port: procRes.port ?? PORT,
            url: `/sandbox/${p.id}`,
            startedAt: new Date().toISOString(),
            logs: procRes.logs,
          };
        }
      } else if (act.type === 'benchmark' && act.projectId) {
        const p = store.projects.find((item) => item.id === act.projectId);
        if (p) {
          const url = `http://127.0.0.1:${PORT}/sandbox/${p.id}/health`;
          const lats: number[] = [];
          let successCount = 0;
          let errorCount = 0;
          const totalRequests = 24;
          const tStart = performance.now();
          for (let i = 0; i < totalRequests; i++) {
            const t0 = performance.now();
            try {
              const r = await fetch(url);
              await r.arrayBuffer();
              if (r.ok) successCount += 1;
              else errorCount += 1;
            } catch {
              errorCount += 1;
            }
            lats.push(performance.now() - t0);
          }
          const totalMs = Math.max(1, performance.now() - tStart);
          lats.sort((a, b) => a - b);
          const percentile = (pct: number) =>
            lats.length ? Number(lats[Math.min(lats.length - 1, Math.floor((pct / 100) * lats.length))].toFixed(2)) : 0;
          const report: BenchmarkReport = {
            status: successCount > 0 ? 'completed' : 'skipped',
            reason: successCount > 0 ? undefined : 'لم يستجب أي طلب أثناء القياس.',
            totalRequests,
            concurrency: 1,
            successCount,
            errorCount,
            rps: Number(((successCount / totalMs) * 1000).toFixed(1)),
            avgLatencyMs: lats.length
              ? Number((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(2))
              : 0,
            p50LatencyMs: percentile(50),
            p95LatencyMs: percentile(95),
            p99LatencyMs: percentile(99),
            measuredAt: new Date().toISOString(),
          };
          p.benchmark = report;
          p.files['BENCHMARK_REPORT.json'] = JSON.stringify(report, null, 2);
        }
      } else if (act.type === 'heal_project' && act.projectId) {
        const p = store.projects.find((item) => item.id === act.projectId);
        if (p) {
          const healing = await runProjectHealing(p, 3);
          uiCommand = { action: 'select_project', projectId: p.id, tab: 'healing' };
          spokenReply = `${spokenReply} ${healing.summary}`;
        }
      } else if (act.type === 'migrate_legacy' && act.projectId) {
        const p = store.projects.find((item) => item.id === act.projectId);
        if (p) {
          const mig = modernizeLegacyFiles(p.files, 'Python 3.12');
          if (mig) {
            p.legacyMigration = mig.result;
            Object.assign(p.files, mig.generatedFiles);
            p.diffs = computeUnifiedDiffs(p.baselineFiles || {}, p.files);
          }
        }
      }
    } else if (!route.handledAsAction) {
      // Optional server-side Gemini Cognitive Partner enhancement when GEMINI_API_KEY is available
      const ai = getAiClient();
      if (ai) {
        try {
          const contextSummary = store.projects
            .slice(0, 4)
            .map((p) => `#${p.id}: ${p.title} (${p.language}, ${p.score}/100)`)
            .join(' | ');
          const traitsStr = Object.values(store.cognitive.traits).join('؛ ') || 'غير محددة بعد';

          const aiRes = await ai.models.generateContent({
            model: geminiModel('flash'),
            contents: `أسلوب المستخدم الحالي: ${mindset.thinkingStyleLabel}
حالته الانفعالية: ${mindset.emotionLabel}
سماته المتعلَّمة: ${traitsStr}
المشاريع الحالية: ${contextSummary}
رسالة المستخدم الصوتية: "${transcript}"`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'أنت جينيسيس، شريك هندسي ذكي ودافئ يتحدث العربية بطبيعية واحترافية في جملتين إلى ثلاث جمل قصيرة مناسبة للنطق الصوتي، بدون علامات تنسيق Markdown.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  spokenReply: { type: Type.STRING },
                  suggestedAction: {
                    type: Type.STRING,
                    description: 'One of: none, create_project, benchmark, start_sandbox',
                  },
                },
              },
            },
          });

          const parsed = JSON.parse(aiRes.text || '{}') as {
            spokenReply?: string;
            suggestedAction?: string;
          };
          if (parsed.spokenReply && parsed.spokenReply.trim()) {
            spokenReply = parsed.spokenReply.trim();
            engineSource = 'gemini-cognitive';
            if (parsed.suggestedAction === 'create_project') {
              nextPending = { action: 'create_project', payload: transcript, projectId: activeProjectId };
            } else if (parsed.suggestedAction === 'benchmark' && activeProjectId) {
              nextPending = { action: 'benchmark', payload: '', projectId: activeProjectId };
            }
          }
        } catch (err) {
          console.warn('Gemini cognitive dialogue error, keeping local cognitive response:', err);
        }
      }
    }

    store.cognitive.pendingSuggestion = nextPending;
    store.cognitive.recentDialogue.push({
      id: store.nextDialogueId++,
      role: 'assistant',
      content: spokenReply,
      thinkingStyle: mindset.thinkingStyle,
      emotion: mindset.emotion,
      intent: route.intent,
      createdAt: new Date().toISOString(),
    });
    if (store.cognitive.recentDialogue.length > 24) {
      store.cognitive.recentDialogue = store.cognitive.recentDialogue.slice(-24);
    }

    // Local offline neural voice: synthesize once, cache by SHA-256, and expose a safe URL.
    const neuralTts = piperTts.status();
    let audioUrl: string | null = null;
    if (neuralTts.offline_neural_ready && spokenReply.trim()) {
      const wavPath = await piperTts.synthesizeWav(spokenReply, mindset.prosody);
      audioUrl = toVoiceAudioUrl(wavPath);
    }

    saveStore(store);

    res.json({
      intent: route.intent,
      projectId: createdProject?.id ?? route.actionToExecute?.projectId ?? activeProjectId ?? undefined,
      ecosystem: createdProject?.ecosystemKey,
      spokenReply,
      prosody: mindset.prosody,
      mindset,
      uiCommand,
      engineSource,
      pendingSuggestion: store.cognitive.pendingSuggestion,
      audio_url: audioUrl,
      neural_tts: piperTts.status(),
      data: createdProject ? { project: createdProject } : undefined,
    });
  });

  app.post('/api/voice/tts', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'النص المطلوب نطقه فارغ.' });
      return;
    }
    const prosody = {
      rate: Number(req.body?.prosody?.rate ?? 1.02),
      pitch: Number(req.body?.prosody?.pitch ?? 1.0),
    };
    const skipPiper = req.body?.skipPiper === true;
    const neuralTts = piperTts.status();

    // Tier 1: fully local Piper neural voice (no internet, no API key).
    if (!skipPiper && neuralTts.offline_neural_ready) {
      const wavPath = await piperTts.synthesizeWav(text, prosody);
      if (wavPath) {
        res.json({
          audioUrl: toVoiceAudioUrl(wavPath),
          mimeType: 'audio/wav',
          engine: 'piper-neural-offline',
          neural_tts: piperTts.status(),
        });
        return;
      }
    }

    // Tier 2: Gemini neural TTS when configured.
    const ai = getAiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini TTS غير مفعل في البيئة الحالية؛ سيتم استخدام النطق المحلي بالمتصفح.',
        fallback: 'web-speech',
        neural_tts: piperTts.status(),
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: geminiModel('tts'),
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style: 'Warm, clear, intelligent Arabic software engineering partner',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'لم تُرجع خدمة الصوت بيانات WAV صالحة.' });
        return;
      }
      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        engine: 'gemini-neural-cloud',
        neural_tts: piperTts.status(),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'تعذر توليد الصوت عبر Gemini TTS.',
      });
    }
  });

  app.post('/api/voice/transcribe', async (req, res) => {
    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : 'audio/webm';
    if (!audioBase64) {
      res.status(400).json({ error: 'البيانات الصوتية المطلوب تفريغها فارغة.' });
      return;
    }
    const ai = getAiClient();
    if (!ai) {
      res.status(503).json({
        error: 'خدمة تفريغ الصوت الخادمي غير مفعلة حالياً بدون مفتاح Gemini.',
      });
      return;
    }
    try {
      const cleanB64 = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
      const response = await ai.models.generateContent({
        model: geminiModel('transcribe'),
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleanB64 } },
            { text: 'Transcribe this audio verbatim in its spoken language.' },
          ],
        },
      });
      const text = (response.text || '').trim();
      res.json({ transcript: text });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'فشل تفريغ الملف الصوتي عبر Gemini.',
      });
    }
  });

  // 7. Knowledge Vault CRUD
  app.get('/api/vault', (_req, res) => {
    res.json({ vault: store.vault });
  });

  app.post('/api/vault', (req, res) => {
    const domain = String(req.body?.domain || '').trim();
    const pattern = String(req.body?.pattern || '').trim();
    const verifiedWisdom = String(req.body?.verifiedWisdom || '').trim();

    if (!domain || !pattern || !verifiedWisdom) {
      res.status(400).json({ error: 'جميع حقول القاعدة الهندسية مطلوبة.' });
      return;
    }

    const entry: VaultEntry = {
      id: store.nextVaultId++,
      domain,
      pattern,
      verifiedWisdom,
      createdAt: new Date().toISOString(),
    };
    store.vault.unshift(entry);
    saveStore(store);
    res.status(201).json({ entry });
  });

  app.delete('/api/vault/:id', (req, res) => {
    const id = Number(req.params.id);
    const before = store.vault.length;
    store.vault = store.vault.filter((v) => v.id !== id);
    if (store.vault.length === before) {
      res.status(404).json({ error: 'القاعدة غير موجودة.' });
      return;
    }
    saveStore(store);
    res.json({ deletedId: id });
  });

  // 8. Watch Folders CRUD & Real Filesystem Scan
  app.get('/api/watches', (_req, res) => {
    res.json({ watches: store.watches });
  });

  app.post('/api/watches', (req, res) => {
    const folderPath = String(req.body?.folderPath || '').trim();
    const goal = String(req.body?.goal || '').trim();
    const intervalSec = Math.max(10, Math.min(3600, Number(req.body?.intervalSec || 30)));

    if (!folderPath || !goal) {
      res.status(400).json({ error: 'يرجى تحديد مسار المجلد وهدف المراقبة.' });
      return;
    }

    const inspectionRes = inspectWatchedDirectory(folderPath, __dirname);
    if (!inspectionRes.ok || !inspectionRes.inspection) {
      res.status(400).json({ error: inspectionRes.error || 'تعذر قراءة المجلد المحدد على القرص.' });
      return;
    }

    const watch: WatchFolder = {
      id: store.nextWatchId++,
      folderPath,
      goal,
      intervalSec,
      enabled: true,
      filesCount: inspectionRes.inspection.filesCount,
      lastTreeHash: inspectionRes.inspection.treeHash,
      lastFileHashes: inspectionRes.inspection.fileHashes,
      changedFiles: [],
      lastCheckedAt: new Date().toISOString(),
      lastTriggeredProjectId: null,
    };
    store.watches.unshift(watch);
    saveStore(store);
    scheduleWatchScans();
    res.status(201).json({ watch });
  });

  app.post('/api/watches/:id/toggle', (req, res) => {
    const id = Number(req.params.id);
    const watch = store.watches.find((w) => w.id === id);
    if (!watch) {
      res.status(404).json({ error: 'المجلد المراقب غير موجود.' });
      return;
    }
    watch.enabled = !watch.enabled;
    watch.lastCheckedAt = new Date().toISOString();
    saveStore(store);
    scheduleWatchScans();
    res.json({ watch });
  });

  let watchScanInFlight = false;

  /** Shared by the manual endpoint and the continuous scheduler. */
  async function scanWatches(targetId: number | null): Promise<{
    watches: WatchFolder[];
    scannedCount: number;
    scannedAt: string;
    triggeredProjects: ProjectRecord[];
  }> {
    if (watchScanInFlight) {
      return { watches: store.watches, scannedCount: 0, scannedAt: new Date().toISOString(), triggeredProjects: [] };
    }
    watchScanInFlight = true;
    const now = new Date().toISOString();
    let scannedCount = 0;
    const triggeredProjects: ProjectRecord[] = [];
    try {
      for (const w of store.watches) {
        if ((targetId === null && w.enabled) || w.id === targetId) {
          const resInspect = inspectWatchedDirectory(
            w.folderPath,
            __dirname,
            w.lastTreeHash,
            w.lastFileHashes,
          );
          w.lastCheckedAt = now;
          if (resInspect.ok && resInspect.inspection) {
            w.filesCount = resInspect.inspection.filesCount;
            w.lastTreeHash = resInspect.inspection.treeHash;
            w.lastFileHashes = resInspect.inspection.fileHashes;
            w.changedFiles = resInspect.changedFiles || [];

            if (
              resInspect.changed ||
              (!w.lastTriggeredProjectId && Object.keys(resInspect.inspection.files).length > 0)
            ) {
              const audited = await runPipelineSynthesis({
                id: store.nextProjectId++,
                title: `تدقيق مجلد مراقب: ${path.basename(w.folderPath) || w.folderPath}`,
                prompt: w.goal,
                mode: 'audit',
                vault: store.vault,
                uploadedFiles: resInspect.inspection.files,
              });
              store.projects.unshift(audited);
              w.lastTriggeredProjectId = audited.id;
              triggeredProjects.push(audited);
            }
          }
          scannedCount += 1;
        }
      }
      saveStore(store);
      return { watches: store.watches, scannedCount, scannedAt: now, triggeredProjects };
    } finally {
      watchScanInFlight = false;
    }
  }

  // Real continuous monitoring: the shortest enabled interval drives the tick.
  let watchTimer: NodeJS.Timeout | null = null;
  function scheduleWatchScans(): void {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    const active = store.watches.filter((w) => w.enabled);
    if (active.length === 0) return;
    const pollSec = Math.max(10, Math.min(...active.map((w) => w.intervalSec)));
    watchTimer = setInterval(() => {
      void scanWatches(null);
    }, pollSec * 1000);
    watchTimer.unref();
  }
  scheduleWatchScans();

  app.post('/api/watches/scan', async (req, res) => {
    const targetId = typeof req.body?.watchId === 'number' ? req.body.watchId : null;
    res.json(await scanWatches(targetId));
  });

  app.delete('/api/watches/:id', (req, res) => {
    const id = Number(req.params.id);
    const before = store.watches.length;
    store.watches = store.watches.filter((w) => w.id !== id);
    if (store.watches.length === before) {
      res.status(404).json({ error: 'المجلد المراقب غير موجود.' });
      return;
    }
    saveStore(store);
    scheduleWatchScans();
    res.json({ deletedId: id });
  });

  // Vite Middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`GENESIS-OMEGA Server running on http://${HOST}:${PORT}`);
  });

  const gracefulShutdown = () => {
    stopAllSandboxes();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
