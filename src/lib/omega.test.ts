import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  discoverEndpoints,
  generateEndpointMockTests,
  generateOpenApiAndSwagger,
} from './apidocs';
import {
  analyzeMindsetAndEmotion,
  isAffirmation,
  routeVoiceIntent,
  stripWakeWord,
} from './cognitive';
import {
  buildArchitectureDiagrams,
  generateProjectScaffold,
  synthesizeReasoningBrief,
} from './diagrams';
import { detectEcosystem, ECOSYSTEM_CATALOG, generateMultiOsAndContainerBundle } from './ecosystems';
import { buildExportBundleManifest, sanitizeGitRemoteUrl } from './export';
import { materializeExportToDisk } from './export_fs';
import { detectLegacyFiles, modernizeLegacyFiles } from './legacy';
import { geminiModel, resolveGeminiTextModel } from './gemini_models';
import { AVAILABLE_MODELS, resolveAsymmetricRouting } from './routing';
import {
  computeUnifiedDiffs,
  evaluateWithAtomicRollback,
  generateCycloneDxSbom,
  isSafeRelativePath,
  scanSecretsAndSecurity,
  validateRedTeamScript,
} from './security';
import type { GovernorStats, ProjectRecord } from './types';
import {
  getLiveSandboxInfo,
  probeLiveSandbox,
  startSandboxProcess,
  stopSandboxProcess,
} from './sandbox_runner';
import { verifyProjectWorkspace } from './verifier';
import { inspectWatchedDirectory } from './watcher';

const SAMPLE_GOVERNOR: GovernorStats = {
  os: 'Linux',
  cpuCores: 8,
  totalRamGb: 16,
  availableRamGb: 9.5,
  ramUsedPct: 40.6,
  profile: 'balanced_light',
  ollamaTuning: { numCtx: 6144, numThread: 6, keepAlive: '45s' },
  maxPromptChars: 6000,
  watchPollSec: 2.5,
};

test('Polyglot matrix exposes 18 ecosystems and detects modern & legacy languages', () => {
  assert.equal(Object.keys(ECOSYSTEM_CATALOG).length, 18);
  assert.equal(detectEcosystem('نظام بنكي بلغة cobol').key, 'cobol');
  assert.equal(detectEcosystem('أداة سريعة بلغة rust').key, 'rust');
  assert.equal(detectEcosystem('خادم REST API بلغة Go').key, 'go');

  const bundle = generateMultiOsAndContainerBundle('Bank Mainframe', ECOSYSTEM_CATALOG.cobol);
  assert.ok(bundle.dockerfile.includes('gnucobol'));
  assert.ok(bundle.dockerfile.includes('USER omegauser'));
  assert.ok(bundle.makefile.includes('docker-up:'));
  assert.ok(bundle.dockerignore.includes('node_modules'));
  assert.ok(bundle.systemdPath.endsWith('bank-mainframe.service'));
});

test('SBOM guardian generates CycloneDX 1.5 SHA-256 manifest and flags leaked secrets', () => {
  const cleanSbom = generateCycloneDxSbom('CleanApp', {
    'main.py': 'def ok():\n    return True\n',
    'requirements.txt': 'uvicorn\n',
  });
  assert.equal(cleanSbom.bomFormat, 'CycloneDX');
  assert.equal(cleanSbom.securityAudit.supplyChainStatus, 'clean');
  assert.ok(cleanSbom.components.some((c) => c.type === 'library' && c.name === 'uvicorn'));

  const leakyScan = scanSecretsAndSecurity({
    'leak.py': 'API_KEY = "sk_live_1234567890abcdef"\n',
  });
  assert.equal(leakyScan.secrets.length, 2);
});

test('Path traversal guard rejects unsafe relative paths', () => {
  assert.equal(isSafeRelativePath('../../etc/passwd'), null);
  assert.equal(isSafeRelativePath('.git/config'), null);
  assert.equal(isSafeRelativePath('src/main.py'), 'src/main.py');
});

test('Red-Team script validator & Atomic Snapshot Rollback protect against regression', () => {
  const unsafe = validateRedTeamScript('import shutil\nshutil.rmtree("/tmp/app")\n');
  assert.equal(unsafe.safe, false);
  assert.ok(unsafe.violations.length >= 1);

  const safe = validateRedTeamScript('import unittest\nassert 1 + 1 == 2\n');
  assert.equal(safe.safe, true);

  const baseline = { 'main.py': 'def run():\n    return {"ok": True}\n' };
  const degradedCandidate = { 'main.py': 'def run():\n    return eval("1+1")\n' };

  const rollbackResult = evaluateWithAtomicRollback(baseline, degradedCandidate, (files) => {
    const scan = scanSecretsAndSecurity(files);
    return {
      score: 97 - scan.secrets.length * 18 - scan.staticIssues.length * 7,
      secretsCount: scan.secrets.length,
    };
  });

  assert.equal(rollbackResult.rollback.applied, true);
  assert.equal(rollbackResult.files['main.py'], baseline['main.py']);
  assert.equal(rollbackResult.evaluation.score, 97);
});

test('Unified diff computes line-level additions and removals', () => {
  const diffs = computeUnifiedDiffs(
    { 'app.py': 'def run():\n    return eval("1+1")\n' },
    { 'app.py': 'def run():\n    return 2\n' },
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].status, 'modified');
  assert.equal(diffs[0].added, 1);
  assert.equal(diffs[0].removed, 1);
});

test('Legacy migration agent detects COBOL and generates modernized Python parity tests', () => {
  const legacyFiles = {
    'PAYROLL.cob': 'IDENTIFICATION DIVISION.\nPROGRAM-ID. PAYROLL.\nPROCEDURE DIVISION.\nSTOP RUN.\n',
  };
  const hits = detectLegacyFiles(legacyFiles);
  assert.equal(hits[0].language, 'COBOL');

  const mig = modernizeLegacyFiles(legacyFiles, 'Python 3.12');
  assert.ok(mig !== null);
  assert.ok(mig.generatedFiles['modernized_app.py']);
  assert.ok(mig.generatedFiles['test_migration_parity.py']);
  assert.ok(mig.generatedFiles['MIGRATION_REPORT.md']);
});

test('Deep reasoning and architecture diagrams extract WAL requirements & ERD entities', () => {
  const eco = detectEcosystem('خادم REST API للمبيعات مع قاعدة بيانات SQLite');
  const brief = synthesizeReasoningBrief('خادم REST API للمبيعات مع قاعدة بيانات', eco);
  assert.ok(brief.predictedRequirements.length >= 3);
  assert.ok(brief.reasoningBrief.includes('WAL'));

  const diagrams = buildArchitectureDiagrams('Sales API', 'مبيعات', {
    'db.py': 'CREATE TABLE products (id INTEGER, sku TEXT, price REAL);',
  });
  assert.ok(diagrams.erdMermaid.includes('PRODUCTS'));
  assert.ok(diagrams.sequenceMermaid.includes('sequenceDiagram'));
});

test('Endpoint discovery, OpenAPI/Swagger, mock fixtures, and complete domain artifacts generate end-to-end', () => {
  const eco = ECOSYSTEM_CATALOG.python;
  const scaffold = generateProjectScaffold('CRM API', 'نظام إدارة العملاء والفواتير API', eco);
  assert.ok(scaffold['swagger_ui.html'].includes('OpenAPI 3.0.3'));
  assert.ok(scaffold['docs_server.py']);
  assert.ok(scaffold['mock_fixtures.json']);
  assert.ok(scaffold['test_api_mocks.py']);
  assert.ok(scaffold['test_db_migrations.py']);
  assert.ok(scaffold['fullstack_server.py']);
  assert.ok(scaffold['test_fullstack_e2e.py']);
  assert.ok(scaffold['red_team_attack.py']);
  assert.ok(scaffold['index.html'].includes('/api/customers'));
  assert.ok(scaffold['architecture_diagrams.html'].includes('Mermaid'));
  assert.ok(scaffold['SETUP_GUIDE.md'].includes('دليل التشغيل والنشر المحلي'));
  assert.ok(scaffold['Makefile']);
  assert.ok(scaffold['.dockerignore']);
  assert.ok(scaffold['ARCHITECTURE.md']);

  const discovered = discoverEndpoints(scaffold, 'نظام إدارة العملاء', 'CRM API');
  assert.ok(discovered.some((ep) => ep.path === '/health'));
  assert.ok(discovered.some((ep) => ep.path === '/api/customers'));

  const docs = generateOpenApiAndSwagger('CRM API', 'Test', discovered);
  assert.ok(docs.openapiJson.includes('/api/customers'));
  const mocks = generateEndpointMockTests('CRM API', ECOSYSTEM_CATALOG.typescript, discovered);
  assert.equal(mocks.filename, 'test_api_mocks.ts');
});

test('Real OS workspace verifier executes python3 unittest, sqlite3 DDL, red-team scripts, and catches failures', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-verify-'));
  try {
    const pyFiles = generateProjectScaffold(
      'منصة المرضى الطبية',
      'منصة إدارة المرضى والمواعيد الطبية بلغة Python مع SQLite WAL',
      ECOSYSTEM_CATALOG.python,
    );
    const okRes = await verifyProjectWorkspace(path.join(tmpRoot, 'clinic-ok'), pyFiles, 'python');
    assert.equal(okRes.ranRealTests, true);
    assert.equal(okRes.runtime, 'python3');
    assert.equal(okRes.exitCode, 0);
    assert.equal(okRes.redTeamPassed, true);
    assert.ok(okRes.testsExecuted >= 6);
    assert.equal(okRes.testsPassed, okRes.testsExecuted);

    const brokenFiles = {
      ...pyFiles,
      'test_service.py': 'import unittest\nclass Broken(unittest.TestCase):\n    def test_fail(self):\n        self.assertEqual(1, 2)\n',
    };
    const failRes = await verifyProjectWorkspace(path.join(tmpRoot, 'clinic-fail'), brokenFiles, 'python');
    assert.equal(failRes.ranRealTests, true);
    assert.notEqual(failRes.exitCode, 0);

    const nodeFiles = generateProjectScaffold(
      'Orders API',
      'خادم Node.js لإدارة الطلبات والمبيعات',
      ECOSYSTEM_CATALOG.nodejs,
    );
    const nodeRes = await verifyProjectWorkspace(path.join(tmpRoot, 'orders-node'), nodeFiles, 'nodejs');
    assert.equal(nodeRes.ranRealTests, true);
    assert.equal(nodeRes.runtime, 'node');
    assert.equal(nodeRes.exitCode, 0);
    assert.ok(nodeRes.testsExecuted >= 3);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Filesystem watcher inspects real directories, detects changes, and rejects system paths', () => {
  const forbidden = inspectWatchedDirectory('/etc', process.cwd());
  assert.equal(forbidden.ok, false);

  const tmpWatch = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-watch-'));
  try {
    fs.writeFileSync(path.join(tmpWatch, 'service.py'), 'print("v1")\n', 'utf-8');
    const scan1 = inspectWatchedDirectory(tmpWatch, process.cwd());
    assert.equal(scan1.ok, true);
    assert.equal(scan1.inspection?.filesCount, 1);

    fs.writeFileSync(path.join(tmpWatch, 'service.py'), 'print("v2")\n', 'utf-8');
    const scan2 = inspectWatchedDirectory(
      tmpWatch,
      process.cwd(),
      scan1.inspection?.treeHash,
      scan1.inspection?.fileHashes,
    );
    assert.equal(scan2.ok, true);
    assert.equal(scan2.changed, true);
    assert.ok(scan2.changedFiles?.includes('service.py'));
  } finally {
    fs.rmSync(tmpWatch, { recursive: true, force: true });
  }
});

test('Disk export materializer writes verified bundle and initializes local git safely', async () => {
  const tmpExport = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-export-'));
  try {
    const dummyProj = {
      id: 42,
      title: 'Export Demo',
      prompt: 'API',
      mode: 'new',
      status: 'verified',
      language: 'Python 3.12',
      ecosystemKey: 'python',
      score: 97,
      testsRun: 8,
      redTeamStatus: 'survived',
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      liveLogs: '',
      reportMd: '',
      reasoningBrief: '',
      predictedRequirements: [],
      files: { 'main.py': 'print("ok")\n', '../../evil': 'ignored' },
      diffs: [],
      sandbox: { running: false, port: null, url: null, startedAt: null, logs: '' },
      benchmark: null,
      sbom: null,
      diagrams: { erdMermaid: '', sequenceMermaid: '', entities: [], endpoints: [] },
      legacyMigration: null,
    } as ProjectRecord;

    const initial = buildExportBundleManifest(dummyProj, {
      mode: 'git_deploy',
      remoteUrl: 'https://github.com/genesis-omega/export-demo.git',
      branch: 'main',
    });
    const materialized = await materializeExportToDisk(tmpExport, dummyProj, initial);
    assert.equal(materialized.gitInitialized, true);
    assert.ok(fs.existsSync(path.join(tmpExport, initial.slug, 'main.py')));
    assert.ok(fs.existsSync(path.join(tmpExport, initial.slug, 'EXPORT_MANIFEST.json')));
    assert.ok(fs.existsSync(path.join(tmpExport, initial.slug, '.git')));
    assert.equal(fs.existsSync(path.join(tmpExport, 'evil')), false);
  } finally {
    fs.rmSync(tmpExport, { recursive: true, force: true });
  }
});

test('Asymmetric model routing respects EcoGovernor tier and validates role overrides', () => {
  const ecoRoute = resolveAsymmetricRouting({ profile: 'eco_ultra_light' });
  assert.equal(ecoRoute.architect, geminiModel('flashLite'));

  const customRoute = resolveAsymmetricRouting(SAMPLE_GOVERNOR, {
    red_team: AVAILABLE_MODELS[3].id,
    architect: 'nonexistent-evil-model; rm -rf /',
  });
  assert.equal(customRoute.red_team, AVAILABLE_MODELS[3].id);
  assert.equal(customRoute.architect, geminiModel('flash'));
});

test('Export manifest & Git deploy sanitizer rejects embedded tokens and builds safe push script', () => {
  const badUrl = sanitizeGitRemoteUrl('https://ghp_secretToken@github.com/org/repo.git');
  assert.equal(badUrl.valid, false);

  const okUrl = sanitizeGitRemoteUrl('https://github.com/genesis-omega/demo-api.git');
  assert.equal(okUrl.valid, true);

  const dummyProj = {
    id: 9,
    title: 'Demo API',
    prompt: 'API',
    mode: 'new',
    status: 'verified',
    language: 'Python 3.12',
    ecosystemKey: 'python',
    score: 97,
    testsRun: 8,
    redTeamStatus: 'survived',
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    liveLogs: '',
    reportMd: '',
    reasoningBrief: '',
    predictedRequirements: [],
    files: { 'main.py': 'print("ok")\n', '../../evil': 'ignored' },
    diffs: [],
    sandbox: { running: false, port: null, url: null, startedAt: null, logs: '' },
    benchmark: null,
    sbom: null,
    diagrams: { erdMermaid: '', sequenceMermaid: '', entities: [], endpoints: [] },
    legacyMigration: null,
  } as ProjectRecord;

  const manifest = buildExportBundleManifest(dummyProj, {
    mode: 'git_deploy',
    remoteUrl: 'https://github.com/genesis-omega/demo-api.git',
    branch: 'release/v1',
  });
  assert.equal(manifest.fileCount, 1);
  assert.ok(manifest.deployScript?.includes('BRANCH="release/v1"'));
});

test('Cognitive voice engine analyzes mindset, strips wake words, and handles multi-turn dialogue', () => {
  assert.equal(stripWakeWord('يا جينيسيس شغل المشروع رقم 2'), 'شغل المشروع رقم 2');
  assert.equal(isAffirmation('أيوه يلا بينا'), true);

  const { mindset, discoveredTraits } = analyzeMindsetAndEmotion(
    'بفكر أعمل أداة خفيفة تشتغل بدون إنترنت لإدارة العملاء',
  );
  assert.ok(discoveredTraits.deployment_preference);
  assert.ok(discoveredTraits.architecture_style);
  assert.equal(mindset.prosody.rate > 0, true);

  const dummyProjects: ProjectRecord[] = [];
  const turn1 = routeVoiceIntent('بفكر أعمل أداة خفيفة لإدارة المبيعات', {
    activeProjectId: null,
    projects: dummyProjects,
    governor: SAMPLE_GOVERNOR,
    pendingSuggestion: null,
    traits: {},
  });
  assert.equal(turn1.intent, 'human_dialogue');
  assert.equal(turn1.newPendingSuggestion?.action, 'create_project');

  const turn2 = routeVoiceIntent('أيوه يلا بينا', {
    activeProjectId: null,
    projects: dummyProjects,
    governor: SAMPLE_GOVERNOR,
    pendingSuggestion: turn1.newPendingSuggestion ?? null,
    traits: {},
  });
  assert.equal(turn2.intent, 'create_project');
  assert.equal(turn2.actionToExecute?.type, 'create_project');

  const healTurn = routeVoiceIntent('يا جينيسيس أصلح المشروع رقم 1', {
    activeProjectId: null,
    projects: dummyProjects,
    governor: SAMPLE_GOVERNOR,
    pendingSuggestion: null,
    traits: {},
  });
  assert.equal(healTurn.intent, 'heal_project');
  assert.equal(healTurn.actionToExecute?.type, 'heal_project');
  assert.equal(healTurn.actionToExecute?.projectId, 1);
  assert.deepEqual(healTurn.uiCommand, { action: 'select_project', projectId: 1, tab: 'healing' });
});

test('COBOL legacy extractor preserves numeric constants and passes real python3 unittest parity suite', async () => {
  const cobolCode = `IDENTIFICATION DIVISION.
PROGRAM-ID. PAYROLL-CALC.
DATA DIVISION.
WORKING-STORAGE SECTION.
01 WS-HOURS       PIC 9(3) VALUE 40.
01 WS-RATE        PIC 9(4)V99 VALUE 55.50.
PROCEDURE DIVISION.
    STOP RUN.`;
  const mig = modernizeLegacyFiles({ 'PAYROLL.cob': cobolCode }, 'Python 3.12');
  assert.ok(mig !== null);
  assert.ok(mig.generatedFiles['modernized_app.py'].includes('EXTRACTED_LEGACY_CONSTANTS'));
  assert.ok(mig.generatedFiles['modernized_app.py'].includes('"ws_hours": 40'));
  assert.ok(mig.generatedFiles['test_migration_parity.py'].includes('2220'));

  const tmpMig = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-legacy-'));
  try {
    const ver = await verifyProjectWorkspace(tmpMig, mig.generatedFiles, 'python');
    assert.equal(ver.ranRealTests, true);
    assert.equal(ver.exitCode, 0);
    assert.ok(ver.testsPassed >= 2);
  } finally {
    fs.rmSync(tmpMig, { recursive: true, force: true });
  }
});

test('Live OS sandbox runner spawns generated Python backend on free port, serves SQLite CRUD probes, and stops cleanly', async (t) => {
  const tmpSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-sandbox-'));
  const files = generateProjectScaffold(
    'Live Billing API',
    'نظام إدارة العملاء والفواتير مع SQLite',
    ECOSYSTEM_CATALOG.python,
  );
  const dummyProj = {
    id: 9901,
    title: 'Live Billing API',
    prompt: 'نظام إدارة العملاء',
    mode: 'new',
    status: 'verified',
    language: 'Python 3.12',
    ecosystemKey: 'python',
    score: 97,
    testsRun: 8,
    redTeamStatus: 'survived',
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    liveLogs: '',
    reportMd: '',
    reasoningBrief: '',
    predictedRequirements: [],
    files,
    diffs: [],
    sandbox: { running: false, port: null, url: null, startedAt: null, logs: '' },
    benchmark: null,
    sbom: null,
    diagrams: { erdMermaid: '', sequenceMermaid: '', entities: [], endpoints: [] },
    legacyMigration: null,
  } as ProjectRecord;

  try {
    let started;
    try {
      started = await startSandboxProcess(tmpSandbox, dummyProj);
    } catch (err) {
      if ((err as { code?: string })?.code === 'SANDBOX_UNAVAILABLE') {
        t.skip(`OS sandbox unavailable on this host: ${(err as Error).message}`);
        return;
      }
      throw err;
    }
    assert.equal(started.liveProcess, true);
    assert.ok(typeof started.port === 'number' && started.port > 0);
    assert.ok(getLiveSandboxInfo(dummyProj.id) !== null);

    const healthProbe = await probeLiveSandbox(dummyProj.id, '/health', 'GET');
    assert.ok(healthProbe !== null);
    assert.equal(healthProbe.status, 200);
    assert.equal(healthProbe.liveProcess, true);

    const postRes = await probeLiveSandbox(dummyProj.id, '/api/customers', 'POST', {
      name: 'Acme Cairo',
      email: 'acme@example.com',
    });
    assert.ok(postRes !== null);
    assert.equal(postRes.status, 201);

    const getRes = await probeLiveSandbox(dummyProj.id, '/api/customers', 'GET');
    assert.ok(getRes !== null);
    assert.equal(getRes.status, 200);
    const bodyObj = getRes.body as { customers?: Array<{ name?: string }> };
    assert.ok(Array.isArray(bodyObj.customers));
    assert.ok(bodyObj.customers!.some((c) => c.name === 'Acme Cairo'));

    await stopSandboxProcess(dummyProj.id);
    assert.equal(getLiveSandboxInfo(dummyProj.id), null);
  } finally {
    await stopSandboxProcess(dummyProj.id);
    fs.rmSync(tmpSandbox, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
});
