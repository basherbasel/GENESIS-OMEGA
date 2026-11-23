import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardMetrics } from './dashboard_metrics';
import type { ProjectRecord } from './types';

function project(id: number, patch: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id,
    title: `Project ${id}`,
    prompt: 'test',
    mode: 'new',
    status: id === 2 ? 'needs_review' : 'verified',
    language: 'Python 3.12',
    ecosystemKey: id === 3 ? 'go' : 'python',
    score: id === 2 ? 82 : 97,
    testsRun: 10,
    redTeamStatus: id === 2 ? 'breached' : 'survived',
    createdAt: '',
    finishedAt: '',
    liveLogs: '',
    reportMd: '',
    reasoningBrief: '',
    predictedRequirements: [],
    files: {},
    diffs: [],
    sandbox: { running: false, port: null, url: null, startedAt: null, logs: '' },
    benchmark: null,
    sbom: null,
    diagrams: { erdMermaid: '', sequenceMermaid: '', entities: [], endpoints: [] },
    legacyMigration: null,
    ...patch,
  } as ProjectRecord;
}

test('empty project list produces a safe zeroed dashboard', () => {
  const m = computeDashboardMetrics([]);
  assert.equal(m.total, 0);
  assert.equal(m.averageScore, 0);
  assert.equal(m.totalTests, 0);
  assert.deepEqual(m.byEcosystem, []);
  assert.equal(m.latestBenchmarkAt, null);
});

test('aggregates scores, tests, red-team results and ecosystems', () => {
  const m = computeDashboardMetrics([project(1), project(2), project(3)]);
  assert.equal(m.total, 3);
  assert.equal(m.verified, 2);
  assert.equal(m.needsReview, 1);
  assert.equal(m.averageScore, 92); // (97+82+97)/3
  assert.equal(m.totalTests, 30);
  assert.equal(m.redTeamSurvived, 2);
  assert.deepEqual(m.byEcosystem, [
    { key: 'python', count: 2 },
    { key: 'go', count: 1 },
  ]);
  assert.equal(m.scoreBars.length, 3);
  assert.equal(m.scoreBars[1].score, 82);
});

test('collects only real benchmark and healing records', () => {
  const measured = {
    status: 'completed' as const,
    totalRequests: 60,
    concurrency: 6,
    successCount: 58,
    errorCount: 2,
    rps: 120.5,
    avgLatencyMs: 4.2,
    p50LatencyMs: 3.1,
    p95LatencyMs: 8.4,
    p99LatencyMs: 11.2,
    measuredAt: '2026-11-22T10:00:00.000Z',
  };
  const m = computeDashboardMetrics([
    project(1, { benchmark: measured }),
    project(2, {
      healing: {
        projectId: 2,
        startedAt: '',
        finishedAt: '',
        status: 'improved',
        initialScore: 70,
        finalScore: 90,
        initialVerification: {} as never,
        finalVerification: {} as never,
        attempts: [{ label: 'fix' } as never],
        summary: 'ok',
      },
    }),
  ]);
  assert.equal(m.benchmarks.length, 1);
  assert.equal(m.benchmarks[0].rps, 120.5);
  assert.equal(m.latestBenchmarkAt, measured.measuredAt);
  assert.equal(m.healing.length, 1);
  assert.equal(m.healing[0].attempts, 1);
  assert.equal(m.healing[0].finalScore, 90);
});
