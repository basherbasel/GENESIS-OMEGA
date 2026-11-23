/**
 * Pure aggregation for the workshop dashboard.
 *
 * Reads only fields already present on ProjectRecord; performs no I/O and
 * depends on no chart library. Time O(n) over projects, space O(n).
 */

import type { ProjectRecord } from './types';

export interface DashboardMetrics {
  total: number;
  verified: number;
  needsReview: number;
  averageScore: number;
  totalTests: number;
  redTeamSurvived: number;
  byEcosystem: Array<{ key: string; count: number }>;
  scoreBars: Array<{ id: number; title: string; score: number; status: string }>;
  benchmarks: Array<{
    projectId: number;
    rps: number;
    p95LatencyMs: number;
    successCount: number;
    totalRequests: number;
    measuredAt: string;
  }>;
  healing: Array<{
    projectId: number;
    status: string;
    attempts: number;
    initialScore: number;
    finalScore: number;
  }>;
  latestBenchmarkAt: string | null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeDashboardMetrics(projects: ProjectRecord[]): DashboardMetrics {
  const total = projects.length;
  const verified = projects.filter((p) => p.status === 'verified').length;
  const scoreSum = projects.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
  const ecosystemCounts = new Map<string, number>();
  for (const p of projects) {
    const key = p.ecosystemKey || 'unknown';
    ecosystemCounts.set(key, (ecosystemCounts.get(key) || 0) + 1);
  }

  const benchmarks = projects
    .filter((p) => p.benchmark?.status === 'completed')
    .map((p) => ({
      projectId: p.id,
      rps: p.benchmark!.rps,
      p95LatencyMs: p.benchmark!.p95LatencyMs,
      successCount: p.benchmark!.successCount,
      totalRequests: p.benchmark!.totalRequests,
      measuredAt: p.benchmark!.measuredAt,
    }))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

  const healing = projects
    .filter((p) => Boolean(p.healing))
    .map((p) => ({
      projectId: p.id,
      status: p.healing!.status,
      attempts: p.healing!.attempts.length,
      initialScore: p.healing!.initialScore,
      finalScore: p.healing!.finalScore,
    }));

  return {
    total,
    verified,
    needsReview: total - verified,
    averageScore: total === 0 ? 0 : round(scoreSum / total),
    totalTests: projects.reduce((sum, p) => sum + (Number(p.testsRun) || 0), 0),
    redTeamSurvived: projects.filter((p) => p.redTeamStatus === 'survived').length,
    byEcosystem: Array.from(ecosystemCounts, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    scoreBars: projects.map((p) => ({
      id: p.id,
      title: p.title,
      score: Number(p.score) || 0,
      status: p.status,
    })),
    benchmarks,
    healing,
    latestBenchmarkAt: benchmarks[0]?.measuredAt ?? null,
  };
}
