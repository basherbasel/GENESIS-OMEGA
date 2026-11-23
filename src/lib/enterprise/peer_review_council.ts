/**
 * Adversarial multi-brain peer-review council (v3 Part 1).
 *
 * Deterministic structural checks are always executed. A local `auditor` brain
 * then reviews a bounded slice through `local_synthesis` -> `llama-bridge`,
 * fail-closed with an explicit code. CRITICAL/HIGH findings trigger a targeted
 * surgical remediation pass followed by mandatory OS re-verification; an
 * unresolved CRITICAL/HIGH finding rejects the promotion.
 */

import { brainInferenceOptions, buildBrainSystemPrompt, resolveBrainModel } from '../brains/brain_registry';
import { applySurgicalPatches, type PatchRequest } from '../brains/surgical_patcher';
import { synthesizeTextWithBridge, type LocalTextSynthesisOutput } from '../local_synthesis';
import { scanSecretsAndSecurity } from '../security';
import type { ExecutionVerifySummary } from '../types';

export type ReviewSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ReviewCategory =
  | 'logic-flaw'
  | 'boundary-validation'
  | 'error-path'
  | 'concurrency'
  | 'complexity'
  | 'security'
  | 'bridge-failure';

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  file: string;
  line: number;
  category: ReviewCategory;
  rationale: string;
  suggestedFix: string;
  /** Optional exact patch emitted by the reviewer; never applied to an unsafe path. */
  patch?: PatchRequest;
}

export interface PeerReviewInput {
  workspaceDir: string;
  problemStatement: string;
  departments: Array<{ id: string; score?: number }>;
  files: Record<string, string>;
  verification?: ExecutionVerifySummary;
  focusedContext?: string;
  signal?: AbortSignal;
}

export interface RemediationResult {
  files: Record<string, string>;
  changedFiles: string[];
}

export interface PeerReviewDeps {
  synthesizeText?: typeof synthesizeTextWithBridge;
  installedModels?: ReadonlySet<string>;
  model?: string;
  remediate?: (
    findings: ReviewFinding[],
    files: Record<string, string>,
    workspaceDir: string,
  ) => Promise<RemediationResult | null> | RemediationResult | null;
  verify?: (files: Record<string, string>, workspaceDir: string) => Promise<ExecutionVerifySummary>;
  onEvent?: (event: PeerReviewEvent) => void;
}

export interface PeerReviewEvent {
  type: 'peer_review.stage';
  at: string;
  stage: 'STATIC' | 'AUDITOR' | 'REMEDIATION' | 'REJECTED' | 'PASSED';
  detail: string;
  errorCode?: string;
}

export interface PeerReviewResult {
  findings: ReviewFinding[];
  passed: boolean;
  remediationApplied: boolean;
  remediationFiles: string[];
  /** Candidate bytes after any accepted remediation; engine must use these. */
  files?: Record<string, string>;
  postRemediationVerification?: ExecutionVerifySummary;
  bridgeEngine?: string;
  bridgeError?: string;
  staticChecks: number;
  auditorModel?: string;
  at: string;
}

const MAX_FILES = 80;
const MAX_FILE_CHARS = 8_000;
const MAX_FINDINGS = 24;
const SEVERITY_RANK: Record<ReviewSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function emit(input: PeerReviewInput, deps: PeerReviewDeps, event: Omit<PeerReviewEvent, 'at' | 'type'>): void {
  deps.onEvent?.({ type: 'peer_review.stage', at: new Date().toISOString(), ...event });
}

function finding(
  id: string,
  severity: ReviewSeverity,
  file: string,
  line: number,
  category: ReviewCategory,
  rationale: string,
  suggestedFix: string,
): ReviewFinding {
  return { id, severity, file, line, category, rationale, suggestedFix };
}

/** Real deterministic checks; each finding cites an exact file and line. */
export function runStaticPeerChecks(files: Record<string, string>): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const entries = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0])).slice(0, MAX_FILES);

  for (const [file, raw] of entries) {
    const content = raw.slice(0, MAX_FILE_CHARS);
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const number = index + 1;
      const add = (id: string, severity: ReviewSeverity, category: ReviewCategory, rationale: string, fix: string): void => {
        if (findings.length < MAX_FINDINGS) findings.push(finding(id, severity, file, number, category, rationale, fix));
      };
      if (/\b(?:eval|exec)\s*\(|\bos\.system\s*\(|shell\s*=\s*True/.test(line)) {
        add(`static-${findings.length + 1}`, 'CRITICAL', 'security', 'dynamic execution primitive in source', 'replace with an explicit allow-listed call');
      }
      if (/\b(?:catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}|catch\s*\([^)]*\)\s*\{\s*\/\/\s*[^\n]*\})/.test(line)) {
        add(`static-${findings.length + 1}`, 'HIGH', 'error-path', 'error is swallowed without diagnosis', 'record the error code and fail closed');
      }
      if (/\b(?:fs\.(?:readFileSync|writeFileSync|unlinkSync)|open\s*\()/.test(line) && !/isSafeRelativePath|resolveSafeWatchPath/.test(content.slice(Math.max(0, index * 80), index * 80 + 2_000))) {
        add(`static-${findings.length + 1}`, 'HIGH', 'boundary-validation', 'filesystem operation without a visible canonical path guard', 'validate with isSafeRelativePath/resolveSafeWatchPath before the call');
      }
      if (/\bvar\s+[A-Za-z_$][\w$]*/.test(line) && /\bsetInterval\b|\bPromise\.all\b/.test(content)) {
        add(`static-${findings.length + 1}`, 'MEDIUM', 'concurrency', 'mutable shared state near concurrent execution', 'use a local const or a guarded queue');
      }
      if (/\.forEach\s*\([\s\S]{0,80}\.includes\s*\(/.test(line) || /for\s*\([^)]*\)\s*\{[^}]*for\s*\([^)]*\)\s*\{[^}]*for\s*\(/.test(content)) {
        add(`static-${findings.length + 1}`, 'MEDIUM', 'complexity', 'nested linear scan can regress to cubic time', 'replace repeated membership scans with a Set or Map');
      }
      if (/while\s*\(\s*true\s*\)/.test(line) && !/break/.test(content.slice(index * 80, index * 80 + 1_000))) {
        add(`static-${findings.length + 1}`, 'HIGH', 'logic-flaw', 'unbounded loop without a visible exit', 'add a bounded iteration limit and explicit break');
      }
    });

    const secrets = scanSecretsAndSecurity({ [file]: content }).secrets;
    for (const secret of secrets.slice(0, 3)) {
      findings.push(finding(
        `secret-${file}-${secret.line}-${secret.type}`,
        'CRITICAL',
        file,
        secret.line,
        'security',
        `hardcoded ${secret.type} detected by the real secret scanner`,
        'move the value to an environment variable and rotate it',
      ));
    }
  }
  return findings.slice(0, MAX_FINDINGS).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  );
}

function parseAuditorFindings(raw: string, knownFiles: Set<string>): ReviewFinding[] {
  const value = (raw || '').trim();
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(value.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  const container = parsed as { findings?: unknown };
  const items = Array.isArray(container.findings) ? container.findings : [];
  const out: ReviewFinding[] = [];
  for (const item of items.slice(0, MAX_FINDINGS)) {
    const entry = item as Record<string, unknown>;
    const severity = String(entry.severity || '').toUpperCase();
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) continue;
    const rawFile = String(entry.file || '').replace(/^\.\//, '').replace(/\\/g, '/');
    if (!rawFile || !knownFiles.has(rawFile)) continue;
    const line = Number(entry.line);
    if (!Number.isInteger(line) || line < 1) continue;
    const category = String(entry.category || 'logic-flaw') as ReviewCategory;
    const rationale = String(entry.rationale || '').trim();
    if (!rationale) continue;
    const result: ReviewFinding = {
      id: String(entry.id || `auditor-${out.length + 1}`),
      severity: severity as ReviewSeverity,
      file: rawFile,
      line,
      category,
      rationale: rationale.slice(0, 500),
      suggestedFix: String(entry.suggestedFix || '').trim().slice(0, 500) || 'apply the smallest safe correction',
    };
    const patch = entry.patch as { path?: unknown; search?: unknown; replace?: unknown; occurrence?: unknown } | undefined;
    if (patch && typeof patch.path === 'string' && typeof patch.search === 'string' && typeof patch.replace === 'string') {
      result.patch = {
        path: patch.path,
        search: patch.search,
        replace: patch.replace,
        ...(Number.isInteger(patch.occurrence) ? { occurrence: Number(patch.occurrence) } : {}),
      };
    }
    out.push(result);
  }
  return out;
}

/** Default remediation: apply reviewer-provided exact patches atomically. */
export function remediateFindings(
  findings: ReviewFinding[],
  files: Record<string, string>,
): RemediationResult | null {
  const patches = findings
    .filter((item) => item.patch && (item.severity === 'CRITICAL' || item.severity === 'HIGH'))
    .slice(0, 12)
    .map((item) => item.patch!);
  if (patches.length === 0) return null;
  const applied = applySurgicalPatches(files, patches);
  if (!applied.ok) return null;
  return { files: applied.files, changedFiles: applied.changedFiles };
}

function sortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  ).slice(0, MAX_FINDINGS);
}

export async function runPeerReviewCouncil(
  input: PeerReviewInput,
  deps: PeerReviewDeps = {},
): Promise<PeerReviewResult> {
  const at = new Date().toISOString();
  const knownFiles = new Set(Object.keys(input.files));
  let files = input.files;
  const staticFindings = runStaticPeerChecks(files);
  emit(input, deps, { stage: 'STATIC', detail: `findings=${staticFindings.length} files=${knownFiles.size}` });

  const options = brainInferenceOptions('auditor');
  const installed = deps.installedModels || new Set<string>();
  const model = deps.model || resolveBrainModel('auditor', installed);
  const synthesize = deps.synthesizeText || synthesizeTextWithBridge;
  const prompt = [
    `Problem: ${input.problemStatement.slice(0, 2_000)}`,
    `Active departments: ${input.departments.slice(0, 10).map((d) => d.id).join(', ') || 'baseline'}`,
    `Static findings: ${JSON.stringify(staticFindings.slice(0, 8).map((f) => ({ id: f.id, severity: f.severity, file: f.file, line: f.line, category: f.category })))}`,
    `Focused dependency context:\n${(input.focusedContext || '').slice(0, 6_000) || 'not supplied'}`,
    'Review ONLY the supplied excerpts. Return STRICT JSON: {"findings":[{"id":"...","severity":"CRITICAL|HIGH|MEDIUM|LOW","file":"exact/path","line":1,"category":"logic-flaw|boundary-validation|error-path|concurrency|complexity|security","rationale":"...","suggestedFix":"...","patch":{"path":"exact/path","search":"verbatim text","replace":"safe text"}}]}. Do not invent files or line numbers.',
  ].join('\n\n');

  const output: LocalTextSynthesisOutput = await synthesize({
    model,
    system: [
      buildBrainSystemPrompt('auditor'),
      'You are the adversarial peer reviewer. Report only evidence-backed flaws. Never claim formal verification.',
    ].join('\n'),
    prompt,
    numCtx: Math.min(options.numCtx, 8192),
    numPredict: Math.min(options.numPredict, 2048),
    signal: input.signal,
  });

  if (output.error || !output.text.trim()) {
    const errorCode = output.errorCode || 'LOCAL_BRIDGE_FAILED';
    const failed: ReviewFinding = finding(
      'peer-review-bridge',
      'CRITICAL',
      Object.keys(input.files)[0] || '(none)',
      1,
      'bridge-failure',
      `auditor bridge failed: ${output.error || 'empty response'} (${errorCode})`,
      'fix the local bridge and re-run the council; no cloud fallback is allowed',
    );
    emit(input, deps, { stage: 'REJECTED', detail: errorCode, errorCode });
    return {
      findings: [failed],
      passed: false,
      remediationApplied: false,
      remediationFiles: [],
      bridgeEngine: output.engine,
      bridgeError: errorCode,
      staticChecks: staticFindings.length,
      auditorModel: model,
      at,
    };
  }

  let findings = sortFindings([...staticFindings, ...parseAuditorFindings(output.text, knownFiles)]);
  let remediationApplied = false;
  let remediationFiles: string[] = [];
  let postRemediationVerification: ExecutionVerifySummary | undefined;

  const blocking = findings.some((item) => item.severity === 'CRITICAL' || item.severity === 'HIGH');
  if (blocking) {
    emit(input, deps, { stage: 'REMEDIATION', detail: `blocking=${findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length}` });
    const remediate = deps.remediate || remediateFindings;
    const result = await remediate(findings, files, input.workspaceDir);
    if (result) {
      files = result.files;
      remediationFiles = result.changedFiles;
      remediationApplied = result.changedFiles.length > 0;
      if (deps.verify) postRemediationVerification = await deps.verify(files, input.workspaceDir);
      const afterStatic = runStaticPeerChecks(files);
      findings = sortFindings([...afterStatic, ...findings.filter((item) => !remediationFiles.includes(item.file))]);
    }
  }

  const unresolved = findings.filter((item) => item.severity === 'CRITICAL' || item.severity === 'HIGH');
  const passed = unresolved.length === 0;
  if (!passed) emit(input, deps, { stage: 'REJECTED', detail: `unresolved=${unresolved.map((f) => f.id).join(',')}`, errorCode: 'PEER_REVIEW_REJECTED' });
  else emit(input, deps, { stage: 'PASSED', detail: `findings=${findings.length}` });

  return {
    findings,
    passed,
    remediationApplied,
    remediationFiles,
    ...(remediationApplied ? { files } : {}),
    ...(postRemediationVerification ? { postRemediationVerification } : {}),
    bridgeEngine: output.engine,
    staticChecks: staticFindings.length,
    auditorModel: model,
    at,
  };
}
