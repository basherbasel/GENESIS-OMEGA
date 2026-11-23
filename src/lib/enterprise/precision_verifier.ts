/**
 * Quantitative precision & boundary verification harness (v3 Part 1).
 *
 * Measures real wall-clock latency and real process peak RSS, checks repeated
 * run determinism, scans outputs for NaN/Infinity/unbounded numeric drift and
 * probes declared boundary inputs. No value is estimated or simulated.
 */

import type { ExecutionVerifySummary } from '../types';

export const PRECISION_DOMAINS = [
  'physics-simulation',
  'algorithms-optimization',
  'ai-ml-signal',
  'embedded-iot',
  'data-engineering',
] as const;

export type PrecisionDomain = (typeof PRECISION_DOMAINS)[number];

export interface MeasuredRun {
  index: number;
  durationMs: number;
  peakRssKb: number;
  rssDeltaKb: number;
  output: unknown;
}

export interface PrecisionFinding {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  category: 'nondeterminism' | 'numerical-instability' | 'boundary-failure' | 'resource-regression';
  detail: string;
}

export interface BoundaryProbe {
  input: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

export interface PrecisionReport {
  at: string;
  domains: PrecisionDomain[];
  executions: number;
  runs: MeasuredRun[];
  reproducible: boolean;
  reproducibilityRuns: number;
  maxDurationMs: number;
  minDurationMs: number;
  maxPeakRssKb: number;
  findings: PrecisionFinding[];
  boundaryProbes: BoundaryProbe[];
  passed: boolean;
}

export interface PrecisionInput {
  label: string;
  departments: Array<{ id: string; score?: number }>;
  verification?: ExecutionVerifySummary;
  signal?: AbortSignal;
}

export interface PrecisionDeps {
  execute: () => Promise<unknown> | unknown;
  executeBoundary?: (input: string) => Promise<unknown> | unknown;
  runs?: number;
  boundaryInputs?: string[];
  maxDurationMs?: number;
  maxPeakRssKb?: number;
}

const DEFAULT_BOUNDARY_INPUTS = [
  '0',
  '-1',
  String(Number.MAX_SAFE_INTEGER),
  '1e308',
  '',
  '../outside',
  '\u0000',
  'not-a-number',
];

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1e12) / 1e12) : String(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function containsNonFinite(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsNonFinite(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = containsNonFinite(item);
      if (found) return found;
    }
  }
  if (typeof value === 'string' && /\b(?:NaN|Infinity|-Infinity)\b/.test(value)) return value.slice(0, 120);
  return null;
}

function rssKb(): number {
  try {
    return process.resourceUsage().maxRSS || 0;
  } catch {
    return 0;
  }
}

function activeDomains(departments: PrecisionInput['departments']): PrecisionDomain[] {
  const ids = new Set(departments.map((department) => department.id));
  return PRECISION_DOMAINS.filter((domain) => ids.has(domain));
}

/** Executes the real callback N times and attaches measured evidence. */
export async function measurePrecision(input: PrecisionInput, deps: PrecisionDeps): Promise<PrecisionReport> {
  const runs = Math.max(1, Math.min(5, deps.runs ?? 3));
  const domains = activeDomains(input.departments);
  const findings: PrecisionFinding[] = [];
  const executions: MeasuredRun[] = [];

  for (let index = 1; index <= runs; index += 1) {
    if (input.signal?.aborted) {
      findings.push({
        id: 'precision-aborted',
        severity: 'CRITICAL',
        category: 'boundary-failure',
        detail: 'precision measurement aborted by caller',
      });
      break;
    }
    const beforeRss = rssKb();
    const start = performance.now();
    const output = await deps.execute();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const peakRssKb = rssKb();
    executions.push({
      index,
      durationMs,
      peakRssKb,
      rssDeltaKb: Math.max(0, peakRssKb - beforeRss),
      output,
    });
    const nonFinite = containsNonFinite(output);
    if (nonFinite) {
      findings.push({
        id: `precision-nonfinite-${index}`,
        severity: 'CRITICAL',
        category: 'numerical-instability',
        detail: `run ${index} emitted non-finite value: ${nonFinite}`,
      });
    }
  }

  const signatures = executions.map((run) => canonical(run.output));
  const reproducible = executions.length > 1 ? signatures.every((value) => value === signatures[0]) : true;
  if (!reproducible) {
    findings.push({
      id: 'precision-nondeterministic',
      severity: 'HIGH',
      category: 'nondeterminism',
      detail: `outputs differ across ${executions.length} real executions of ${input.label}`,
    });
  }

  const durations = executions.map((run) => run.durationMs);
  const peaks = executions.map((run) => run.peakRssKb);
  const maxDurationMs = durations.length ? Math.max(...durations) : 0;
  const minDurationMs = durations.length ? Math.min(...durations) : 0;
  const maxPeakRssKb = peaks.length ? Math.max(...peaks) : 0;
  if (deps.maxDurationMs && maxDurationMs > deps.maxDurationMs) {
    findings.push({
      id: 'precision-duration-regression',
      severity: 'HIGH',
      category: 'resource-regression',
      detail: `${input.label} took ${maxDurationMs}ms (limit ${deps.maxDurationMs}ms)`,
    });
  }
  if (deps.maxPeakRssKb && maxPeakRssKb > deps.maxPeakRssKb) {
    findings.push({
      id: 'precision-rss-regression',
      severity: 'HIGH',
      category: 'resource-regression',
      detail: `${input.label} peaked at ${maxPeakRssKb}KB RSS (limit ${deps.maxPeakRssKb}KB)`,
    });
  }

  const boundaryProbes: BoundaryProbe[] = [];
  if (domains.length > 0 && deps.executeBoundary) {
    for (const value of (deps.boundaryInputs || DEFAULT_BOUNDARY_INPUTS).slice(0, 8)) {
      const start = performance.now();
      try {
        const output = await deps.executeBoundary(value);
        const nonFinite = containsNonFinite(output);
        const ok = !nonFinite;
        boundaryProbes.push({
          input: value.slice(0, 80),
          ok,
          detail: nonFinite ? `non-finite output: ${nonFinite}` : 'completed with finite output',
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        });
        if (!ok) {
          findings.push({
            id: `precision-boundary-${boundaryProbes.length}`,
            severity: 'CRITICAL',
            category: 'boundary-failure',
            detail: `boundary input ${JSON.stringify(value.slice(0, 40))}: ${boundaryProbes[boundaryProbes.length - 1].detail}`,
          });
        }
      } catch (err) {
        boundaryProbes.push({
          input: value.slice(0, 80),
          ok: false,
          detail: err instanceof Error ? err.message.slice(0, 300) : String(err),
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        });
        findings.push({
          id: `precision-boundary-${boundaryProbes.length}`,
          severity: 'HIGH',
          category: 'boundary-failure',
          detail: `boundary input ${JSON.stringify(value.slice(0, 40))} threw: ${boundaryProbes[boundaryProbes.length - 1].detail}`,
        });
      }
    }
  }

  return {
    at: new Date().toISOString(),
    domains,
    executions: executions.length,
    runs: executions,
    reproducible,
    reproducibilityRuns: executions.length,
    maxDurationMs,
    minDurationMs,
    maxPeakRssKb,
    findings,
    boundaryProbes,
    passed: !findings.some((item) => item.severity === 'CRITICAL' || item.severity === 'HIGH'),
  };
}

/** Convenience wrapper for engines: rejects on a failed precision gate. */
export function assertPrecisionPassed(report: PrecisionReport): void {
  if (!report.passed) {
    const error = new Error(`precision gate rejected: ${report.findings.map((f) => f.id).join(', ')}`);
    (error as Error & { code: string }).code = 'PRECISION_REJECTED';
    throw error;
  }
}
