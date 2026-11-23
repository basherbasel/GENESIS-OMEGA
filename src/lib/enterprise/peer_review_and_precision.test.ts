import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { LocalSynthesisOutput } from '../local_synthesis';
import type { ExecutionVerifySummary } from '../types';
import {
  remediateFindings,
  runPeerReviewCouncil,
  runStaticPeerChecks,
  type PeerReviewResult,
} from './peer_review_council';
import { measurePrecision } from './precision_verifier';
import { WorkOrderEngine, type WorkOrder } from './work_order_engine';

const verification: ExecutionVerifySummary = {
  ranRealTests: true,
  runtime: 'node',
  testsExecuted: 2,
  testsPassed: 2,
  redTeamPassed: true,
  exitCode: 0,
  outputSnippet: 'ok',
};

function workspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('static peer checks flag real security and boundary defects with file/line evidence', () => {
  const findings = runStaticPeerChecks({
    'src/main.js': 'const x = eval(userInput);\nfs.writeFileSync(target, data);\n',
  });
  assert.ok(findings.some((item) => item.severity === 'CRITICAL' && item.category === 'security'));
  assert.ok(findings.some((item) => item.category === 'boundary-validation' && item.line === 2));
});

test('auditor brain findings trigger surgical remediation and mandatory OS re-verification', async () => {
  const dir = workspace('omega-council-');
  try {
    const files = { 'src/app.js': 'const value = eval(payload);\nexport default value;\n' };
    const verified: string[] = [];
    const result = await runPeerReviewCouncil(
      {
        workspaceDir: dir,
        problemStatement: 'remove dynamic execution from app.js',
        departments: [{ id: 'cybersecurity-hardening', score: 3 }],
        files,
        verification,
      },
      {
        synthesizeText: async () => ({
          engine: 'ollama-bridge',
          modelUsed: 'qwen2.5-coder:3b',
          text: JSON.stringify({
            findings: [
              {
                id: 'audit-eval',
                severity: 'HIGH',
                file: 'src/app.js',
                line: 1,
                category: 'security',
                rationale: 'eval executes untrusted text',
                suggestedFix: 'use a literal value',
                patch: { path: 'src/app.js', search: 'eval(payload)', replace: '42' },
              },
            ],
          }),
        }),
        remediate: remediateFindings,
        verify: async (candidate) => {
          verified.push(Object.keys(candidate).join(','));
          return verification;
        },
      },
    );

    assert.equal(result.remediationApplied, true);
    assert.deepEqual(result.remediationFiles, ['src/app.js']);
    assert.equal(result.postRemediationVerification?.exitCode, 0);
    assert.equal(verified.length, 1);
    assert.ok(result.files && !result.files['src/app.js'].includes('eval('));
    assert.equal(result.passed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bridge failure fails the council closed with an explicit code and no remediation', async () => {
  const result = await runPeerReviewCouncil(
    {
      workspaceDir: workspace('omega-council-fail-'),
      problemStatement: 'review',
      departments: [],
      files: { 'src/a.js': 'export const a = 1;\n' },
      verification,
    },
    {
      synthesizeText: async () => ({
        engine: 'ollama-bridge',
        modelUsed: 'qwen2.5-coder:3b',
        text: '',
        errorCode: 'MODEL_NOT_FOUND',
        error: 'model missing',
      }),
    },
  );
  assert.equal(result.passed, false);
  assert.equal(result.bridgeError, 'MODEL_NOT_FOUND');
  assert.equal(result.remediationApplied, false);
  assert.ok(result.findings.some((item) => item.id === 'peer-review-bridge' && item.severity === 'CRITICAL'));
});

test('work order fails closed with PEER_REVIEW_REJECTED when a critical finding is unresolved', async () => {
  const dir = workspace('omega-wo-review-');
  const store = { data: [] as WorkOrder[], load: () => store.data, save: (orders: WorkOrder[]) => { store.data = orders; } };
  const synth = async ({ role }: { role: string }): Promise<LocalSynthesisOutput> => ({
    engine: 'ollama-bridge',
    usedLocal: true,
    modelUsed: 'qwen2.5-coder:1.5b',
    generatedFiles: role === 'coder' ? { 'main.js': 'export const answer = 42;\n' } : {},
    architectureSummary: 'deterministic fixture',
  });
  const failingReview: PeerReviewResult = {
    findings: [{
      id: 'critical',
      severity: 'CRITICAL',
      file: 'main.js',
      line: 1,
      category: 'logic-flaw',
      rationale: 'unresolved critical defect',
      suggestedFix: 'fix it',
    }],
    passed: false,
    remediationApplied: false,
    remediationFiles: [],
    staticChecks: 0,
    at: new Date().toISOString(),
  };
  try {
    const engine = new WorkOrderEngine({
      workspaceRoot: dir,
      store,
      synthesize: synth,
      verify: async () => verification,
      scan: () => ({ secrets: [], staticIssues: [] }),
      peerReview: async () => failingReview,
    });
    const created = engine.create({ title: 'review fixture', problemStatement: 'test peer rejection', targetLang: 'javascript' });
    const finished = await engine.run(created.id);
    assert.equal(finished.stage, 'FAILED_CLOSED');
    assert.equal(finished.errorCode, 'PEER_REVIEW_REJECTED');
    assert.ok(finished.peerReview && !finished.peerReview.passed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('precision harness measures real latency/RSS, determinism, non-finite values and boundaries', async () => {
  const report = await measurePrecision(
    { label: 'precision-fixture', departments: [{ id: 'algorithms-optimization', score: 2 }] },
    {
      runs: 2,
      execute: async () => {
        const start = Date.now();
        while (Date.now() - start < 2) { /* real OS time advances */ }
        return { value: 42, ok: true };
      },
      executeBoundary: (input) => ({ input, finite: Number.isFinite(Number(input)) }),
      boundaryInputs: ['0', '-1', 'not-a-number'],
    },
  );
  assert.equal(report.runs.length, 2);
  assert.ok(report.runs.every((run) => run.durationMs > 0));
  assert.ok(report.runs.every((run) => typeof run.peakRssKb === 'number' && run.peakRssKb >= 0));
  assert.equal(report.reproducible, true);
  assert.deepEqual(report.domains, ['algorithms-optimization']);
  assert.equal(report.boundaryProbes.length, 3);
  assert.equal(report.passed, true);

  const unstable = await measurePrecision(
    { label: 'nan-fixture', departments: [{ id: 'physics-simulation', score: 4 }] },
    {
      runs: 2,
      execute: () => ({ value: Number.NaN }),
      executeBoundary: (input) => ({ input }),
      boundaryInputs: ['0'],
    },
  );
  assert.equal(unstable.passed, false);
  assert.ok(unstable.findings.some((item) => item.category === 'numerical-instability'));
});
