import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDepartments } from './departments';
import { WorkOrderEngine, type WorkOrder, type WorkOrderStore, type WorkOrderEvent } from './work_order_engine';
import { scanSecretsAndSecurity } from '../security';
import type { EcosystemKey, ExecutionVerifySummary } from '../types';
import type { LocalSynthesisOutput } from '../local_synthesis';

function memoryStore(): WorkOrderStore & { saved: number } {
  const box: { orders: WorkOrder[]; saved: number } = { orders: [], saved: 0 };
  return {
    load: () => box.orders,
    save: (orders) => {
      box.orders = orders;
      box.saved += 1;
    },
    get saved() {
      return box.saved;
    },
  };
}

/** Real OS check: node --check on the materialized file. No fabricated counts. */
function realNodeVerifier(workspaceRoot: string) {
  return async (workspaceDir: string, files: Record<string, string>, _eco: EcosystemKey): Promise<ExecutionVerifySummary> => {
    assert.ok(workspaceDir.startsWith(workspaceRoot));
    const target = Object.keys(files).find((f) => f.endsWith('.js'));
    if (!target) {
      return { ranRealTests: false, runtime: 'static-validator', testsExecuted: 0, testsPassed: 0, redTeamPassed: false, exitCode: 1, outputSnippet: 'no js file' };
    }
    const result = spawnSync(process.execPath, ['--check', path.join(workspaceDir, target)], { encoding: 'utf8', timeout: 15_000 });
    const passed = result.status === 0 ? 1 : 0;
    return {
      ranRealTests: true,
      runtime: 'node',
      testsExecuted: 1,
      testsPassed: passed,
      redTeamPassed: result.status === 0,
      exitCode: result.status ?? 1,
      outputSnippet: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    };
  };
}

function synth(overrides: Partial<LocalSynthesisOutput> = {}) {
  return async (params: { role: string }): Promise<LocalSynthesisOutput> => ({
    engine: 'ollama-bridge',
    usedLocal: true,
    modelUsed: 'qwen2.5-coder:3b',
    generatedFiles: params.role === 'architect' ? {} : { 'src/app.js': 'export function answer() { return 42; }\n' },
    architectureSummary: 'single documented module',
    ...overrides,
  });
}

test('department classification activates only evidence-backed contracts', () => {
  const physics = classifyDepartments({
    title: 'محاكاة حركة جسيم',
    problemStatement: 'ODE solver with RK4 and conservation checks for fluid dynamics',
    targetLang: 'python',
  });
  const physicsIds = physics.map((a) => a.department.id);
  assert.ok(physicsIds.includes('physics-simulation'));
  assert.ok(physicsIds.includes('algorithms-optimization'));
  assert.ok(!physicsIds.includes('web-fullstack'));

  const web = classifyDepartments({
    title: 'REST API with SQLite',
    problemStatement: 'typed web backend, health probe and database migrations',
    targetLang: 'typescript',
  });
  const webIds = web.map((a) => a.department.id);
  assert.ok(webIds.includes('web-fullstack'));
  assert.ok(webIds.includes('data-engineering'));
  assert.ok(!webIds.includes('physics-simulation'));

  const baseline = classifyDepartments({ title: 'x', problemStatement: 'y' });
  assert.deepEqual(baseline.map((a) => a.department.id), [
    'cybersecurity-hardening',
    'qa-os-verification',
    'software-architecture',
  ].sort());
});

test('work order advances to VERIFIED_COMMIT with real OS verification', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-wo-'));
  const store = memoryStore();
  const events: WorkOrderEvent[] = [];
  const engine = new WorkOrderEngine({
    workspaceRoot: root,
    store,
    synthesize: synth(),
    verify: realNodeVerifier(root),
    scan: scanSecretsAndSecurity,
    onEvent: (event) => events.push(event),
  });
  try {
    const order = engine.create({
      title: 'Order A',
      problemStatement: 'build a typed API with tests',
      targetLang: 'javascript',
      ecosystemKey: 'nodejs',
    });
    const final = await engine.run(order.id);
    assert.equal(final.stage, 'VERIFIED_COMMIT');
    assert.equal(final.testsRun, 1, 'test count must come from the real OS runner');
    assert.equal(final.verification?.exitCode, 0);
    assert.ok(fs.existsSync(path.join(root, `work_order_${order.id}`, 'src', 'app.js')));
    assert.ok(final.auditLog.some((entry) => entry.stage === 'OS_VERIFICATION'));
    assert.ok(events.some((event) => event.stage === 'VERIFIED_COMMIT'));
    assert.ok(store.saved >= 5, 'every transition must persist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});

test('bridge failure closes the order with an explicit code and no cloud fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-wo-fail-'));
  const engine = new WorkOrderEngine({
    workspaceRoot: root,
    store: memoryStore(),
    synthesize: synth({ usedLocal: false, error: 'model missing', errorCode: 'MODEL_NOT_FOUND' }),
    verify: realNodeVerifier(root),
    scan: scanSecretsAndSecurity,
  });
  try {
    const order = engine.create({ title: 'Order Fail', problemStatement: 'anything' });
    const final = await engine.run(order.id);
    assert.equal(final.stage, 'FAILED_CLOSED');
    assert.equal(final.errorCode, 'MODEL_NOT_FOUND');
    assert.match(final.errorDetail || '', /SPEC_BLUEPRINT/);
    assert.deepEqual(final.files, {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});

test('unsafe emitted paths close the order before any file is written', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-wo-path-'));
  const engine = new WorkOrderEngine({
    workspaceRoot: root,
    store: memoryStore(),
    synthesize: async (params) =>
      params.role === 'architect'
        ? synth()({ role: 'architect' })
        : synth({ generatedFiles: { '../../evil.js': 'bad' } })({ role: 'coder' }),
    verify: realNodeVerifier(root),
    scan: scanSecretsAndSecurity,
  });
  try {
    const order = engine.create({ title: 'Order Path', problemStatement: 'anything' });
    const final = await engine.run(order.id);
    assert.equal(final.stage, 'FAILED_CLOSED');
    assert.equal(final.errorCode, 'UNSAFE_PATH');
    assert.equal(fs.existsSync(path.join(root, 'evil.js')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
