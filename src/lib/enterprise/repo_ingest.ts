/**
 * Existing local repository ingestion, baseline OS/security auditing and
 * atomic autonomous evolution/hardening (v2.0 Phase 3).
 *
 * Safety model
 *  - The user's repository is opened read-only. `validateRepoRoot()` rejects
 *    OS system roots (`C:\Windows`, `Program Files`, `/etc`, `/usr`, `/bin`,
 *    `/System`), drive-relative inputs (`C:`), `..` traversal and non-directory
 *    roots before a single byte is read; `resolveSafeWatchPath()` then applies
 *    the canonical realpath + forbidden-root boundary, and the walk never
 *    follows symlinks so no entry can escape that boundary.
 *  - Candidate changes are produced by the guarded local bridge (fail-closed,
 *    zero cloud fallback) and applied only inside an isolated temporary
 *    workspace copy via the Phase 1 surgical patcher. The originals on disk are
 *    never written until the atomic promotion gate passes.
 *  - Promotion requires: measured score improves or holds, zero NEW security
 *    findings and zero test regressions. Anything else ends FAILED_CLOSED with
 *    exact diagnostics and byte-for-byte identical originals.
 *
 * Time complexity: O(F) for the walk (F = bounded file count) plus O(P x V)
 * for the patch/verify loop (P = bounded patch batch, V = one real OS
 * verification run). Space: O(F) for the in-memory file map, bounded by the
 * MAX_INGEST_* limits so a 16GB local machine stays well within budget.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { formatIndexForPrompt, indexRepository } from '../brains/repo_indexer';
import { applySurgicalPatches, type PatchFailure, type PatchRequest } from '../brains/surgical_patcher';
import type { BrainRole } from '../brains/brain_registry';
import { detectEcosystem } from '../ecosystems';
import { sanitizeCommitMessage } from '../export';
import { buildDeployEnv } from '../git_deploy';
import { computeHealingScore } from '../healer';
import type { LocalTextSynthesisOutput } from '../local_synthesis';
import { computeUnifiedDiffs, isSafeRelativePath, sha256Hex } from '../security';
import type { DiffEntry, EcosystemKey, ExecutionVerifySummary, HealingReport, SecretFinding } from '../types';
import { materializeWorkspaceFiles } from '../verifier';
import { resolveSafeWatchPath } from '../watcher';
import {
  activeRules,
  classifyDepartments,
  verificationGates,
  type DepartmentAssignment,
  type DepartmentInput,
} from './departments';

const execFileAsync = promisify(execFile);

// ── Bounded ingestion limits (16GB local execution budget) ───────────────────
const MAX_INGEST_FILES = 4000;
const MAX_INGEST_BYTES = 96 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 1.5 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;
const MAX_INDEX_FILES = 1000;
const MAX_CONTEXT_CHARS = 16_000;
const MAX_CONTEXT_FILE_CHARS = 4000;
const MAX_DIFF_CHARS = 40_000;
const MAX_PATCHES_PER_RUN = 20;
const MAX_PERSISTED_RUNS = 20;
const MAX_GIT_PATHS_PER_CALL = 50;

/** Heavy build/vcs/cache directories never opened during ingestion. */
const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '__pycache__',
  '.venv',
  'target',
  '.next',
]);
/** Project-specific heavy cache directory, skipped by relative path. */
const SKIP_DIR_PATHS = new Set(['data/voice_cache']);

/** Absolute OS roots rejected before any resolution (cross-platform check). */
const SYSTEM_RAW_PREFIXES = [
  '/windows',
  '/program files',
  '/program files (x86)',
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/system',
  '/library',
  '/applications',
  '/proc',
  '/sys',
  '/dev',
  '/root',
  '/var',
  '/boot',
  '/lib',
  '/private',
];

const MANIFEST_ECOSYSTEMS: Array<{ manifest: string; key: EcosystemKey }> = [
  { manifest: 'pyproject.toml', key: 'python' },
  { manifest: 'requirements.txt', key: 'python' },
  { manifest: 'setup.py', key: 'python' },
  { manifest: 'go.mod', key: 'go' },
  { manifest: 'Cargo.toml', key: 'rust' },
  { manifest: 'pom.xml', key: 'java' },
  { manifest: 'build.gradle', key: 'java' },
  { manifest: 'CMakeLists.txt', key: 'cpp' },
];

// ── Errors ──────────────────────────────────────────────────────────────────

/** Explicit, fail-closed error codes; never a silent fallback. */
export class RepoIngestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepoIngestError';
    this.code = code;
  }
}

export type RepoPathErrorCode = 'UNSAFE_REPO_PATH' | 'REPO_NOT_FOUND';

export interface RepoPathValidation {
  ok: boolean;
  resolved: string;
  code?: RepoPathErrorCode;
  message: string;
}

// ── Path guard ──────────────────────────────────────────────────────────────

function hasSystemPrefix(normalized: string): boolean {
  const lower = normalized.toLowerCase();
  const tail = /^[a-z]:/.test(lower) ? lower.slice(2) : lower;
  return SYSTEM_RAW_PREFIXES.some((prefix) => tail === prefix || tail.startsWith(`${prefix}/`));
}

/**
 * Canonical boundary check for an existing local repository root.
 * Returns an explicit code instead of throwing so callers can map it to HTTP.
 */
export function validateRepoRoot(rawPath: string): RepoPathValidation {
  const reject = (code: RepoPathErrorCode, message: string): RepoPathValidation => ({
    ok: false,
    resolved: '',
    code,
    message,
  });

  const trimmed = (rawPath || '').trim();
  if (!trimmed) return reject('UNSAFE_REPO_PATH', 'empty repository path');
  if (trimmed.includes('\0') || /[;&|`$<>]/.test(trimmed)) {
    return reject('UNSAFE_REPO_PATH', 'illegal characters in repository path');
  }

  const normalized = trimmed.replace(/\\/g, '/');
  // Fail closed on traversal and drive-relative inputs before resolution.
  if (normalized.split('/').some((segment) => segment === '..')) {
    return reject('UNSAFE_REPO_PATH', 'traversal segment (..) rejected');
  }
  if (/^[a-z]:[^/]/i.test(normalized)) {
    return reject('UNSAFE_REPO_PATH', 'drive-relative path rejected');
  }
  if (hasSystemPrefix(normalized)) {
    return reject('UNSAFE_REPO_PATH', 'OS system root rejected');
  }

  const candidate = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(process.cwd(), trimmed);
  if (candidate === path.parse(candidate).root) {
    return reject('UNSAFE_REPO_PATH', 'filesystem root rejected');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(candidate);
  } catch {
    return reject('REPO_NOT_FOUND', `path does not exist on disk: ${trimmed}`);
  }
  if (!stat.isDirectory()) {
    return reject('REPO_NOT_FOUND', `path is not a directory: ${trimmed}`);
  }

  // Canonical realpath + forbidden system-root re-check (reuses the watcher guard).
  const guard = resolveSafeWatchPath(trimmed, process.cwd());
  if (!guard.valid) {
    return reject('UNSAFE_REPO_PATH', guard.error || 'unsafe repository path');
  }

  return { ok: true, resolved: guard.resolved, message: 'ok' };
}

// ── Ingestion ───────────────────────────────────────────────────────────────

export interface IngestOptions {
  /** Root under which the isolated workspace copy is created. */
  workspaceRoot?: string;
  maxFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
}

export interface IngestedFile {
  path: string;
  bytes: number;
  lines: number;
  /** SHA-256 over the exact UTF-8 file bytes (hashing identical to sha256Hex). */
  sha256: string;
}

export interface ExcludedFile {
  path: string;
  reason: 'binary' | 'oversize';
}

export interface RepoIndexSummary {
  files: number;
  symbols: number;
  truncated: boolean;
  warnings: string[];
}

export interface RepoIngestResult {
  repoPath: string;
  workspacePath: string;
  manifest: IngestedFile[];
  excluded: ExcludedFile[];
  warnings: string[];
  totalFiles: number;
  totalBytes: number;
  truncated: boolean;
  ecosystems: string[];
  ecosystemKey: EcosystemKey;
  /** Text file map of the ingested repository (the unit of audit/patching). */
  files: Record<string, string>;
  index: RepoIndexSummary;
  indexPrompt: string;
  at: string;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

interface WalkLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

function walkRepository(root: string, limits: WalkLimits): {
  files: Record<string, string>;
  manifest: IngestedFile[];
  excluded: ExcludedFile[];
  warnings: string[];
  totalBytes: number;
  truncated: boolean;
} {
  const files: Record<string, string> = {};
  const manifest: IngestedFile[] = [];
  const excluded: ExcludedFile[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  let truncated = false;

  const visit = (dir: string): void => {
    if (truncated) return;
    let entries: fs.Dirent[];
    try {
      entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      const rel = path.relative(root, dir) || '.';
      warnings.push(`unreadable directory ${rel}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');

      // Symlinks are never followed: a link could point outside the canonical
      // repository boundary (same rule the symbol indexer applies).
      if (entry.isSymbolicLink()) {
        warnings.push(`skipped symlink ${rel}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name) || SKIP_DIR_PATHS.has(rel)) continue;
        visit(full);
        continue;
      }
      if (!entry.isFile()) continue;

      if (manifest.length >= limits.maxFiles) {
        truncated = true;
        return;
      }

      let buffer: Buffer;
      try {
        buffer = fs.readFileSync(full);
      } catch (err) {
        warnings.push(`unreadable file ${rel}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      if (buffer.length > limits.maxFileBytes) {
        excluded.push({ path: rel, reason: 'oversize' });
        continue;
      }
      if (totalBytes + buffer.length > limits.maxTotalBytes) {
        truncated = true;
        return;
      }
      if (isBinaryBuffer(buffer)) {
        excluded.push({ path: rel, reason: 'binary' });
        continue;
      }

      const content = buffer.toString('utf-8');
      // Reject anything that does not round-trip as UTF-8 (binary without NUL).
      if (!Buffer.from(content, 'utf-8').equals(buffer)) {
        excluded.push({ path: rel, reason: 'binary' });
        continue;
      }

      files[rel] = content;
      manifest.push({
        path: rel,
        bytes: buffer.length,
        lines: content.split('\n').length,
        sha256: sha256Hex(content),
      });
      totalBytes += buffer.length;
    }
  };

  visit(root);
  return { files, manifest, excluded, warnings, totalBytes, truncated };
}

function detectRepoEcosystem(files: Record<string, string>): { key: EcosystemKey; manifests: string[] } {
  const names = Object.keys(files);
  for (const entry of MANIFEST_ECOSYSTEMS) {
    if (names.includes(entry.manifest)) return { key: entry.key, manifests: [entry.manifest] };
  }
  if (names.includes('package.json')) {
    const hasTypeScript =
      names.includes('tsconfig.json') || names.some((name) => name.endsWith('.ts') || name.endsWith('.tsx'));
    return { key: hasTypeScript ? 'typescript' : 'nodejs', manifests: ['package.json'] };
  }
  // Majority source extension so the result is order-independent.
  const counts = new Map<string, number>();
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (!majority) return { key: 'python', manifests: [] };
  return { key: detectEcosystem('', [`probe${majority[0]}`]).key, manifests: [] };
}

/**
 * Read a repository into a bounded file map with SHA-256 manifest and an
 * isolated temporary workspace copy. Throws `RepoIngestError` on unsafe or
 * empty repositories; never writes to the source repository.
 */
export function ingestLocalRepository(repoPath: string, options: IngestOptions = {}): RepoIngestResult {
  const validation = validateRepoRoot(repoPath);
  if (!validation.ok) {
    throw new RepoIngestError(validation.code || 'UNSAFE_REPO_PATH', validation.message);
  }

  const limits: WalkLimits = {
    maxFiles: options.maxFiles ?? MAX_INGEST_FILES,
    maxTotalBytes: options.maxTotalBytes ?? MAX_INGEST_BYTES,
    maxFileBytes: options.maxFileBytes ?? MAX_TEXT_FILE_BYTES,
  };
  const walked = walkRepository(validation.resolved, limits);
  if (walked.manifest.length === 0) {
    throw new RepoIngestError('EMPTY_REPOSITORY', `no ingestible text files under ${validation.resolved}`);
  }

  const workspaceRoot = options.workspaceRoot || path.join(os.tmpdir(), 'omega-ingest');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const workspacePath = fs.mkdtempSync(path.join(workspaceRoot, 'omega-repo-'));
  // Isolated copy: the original repository stays untouched during the run.
  materializeWorkspaceFiles(workspacePath, walked.files);

  const ecosystem = detectRepoEcosystem(walked.files);
  const index = indexRepository(validation.resolved, {
    maxFiles: Math.min(limits.maxFiles, MAX_INDEX_FILES),
    maxBytesPerFile: 512 * 1024,
    excludedDirs: [...SKIP_DIR_NAMES, 'voice_cache'],
  });

  return {
    repoPath: validation.resolved,
    workspacePath,
    manifest: walked.manifest,
    excluded: walked.excluded,
    warnings: walked.warnings,
    totalFiles: walked.manifest.length,
    totalBytes: walked.totalBytes,
    truncated: walked.truncated,
    ecosystems: ecosystem.manifests,
    ecosystemKey: ecosystem.key,
    files: walked.files,
    index: {
      files: index.files.length,
      symbols: index.symbols.length,
      truncated: index.truncated,
      warnings: index.warnings,
    },
    indexPrompt: formatIndexForPrompt(index),
    at: new Date().toISOString(),
  };
}

/** Remove an isolated workspace created by `ingestLocalRepository`. */
export function removeIngestWorkspace(workspacePath: string): boolean {
  if (!workspacePath) return false;
  const resolved = path.resolve(workspacePath);
  const tmp = path.resolve(os.tmpdir());
  const parent = path.dirname(resolved);
  if (parent !== tmp && !parent.startsWith(tmp + path.sep)) return false;
  if (!path.basename(resolved).startsWith('omega-repo-')) return false;
  try {
    fs.rmSync(resolved, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Baseline audit ──────────────────────────────────────────────────────────

export interface RepoAuditDeps {
  verify: (
    workspaceDir: string,
    files: Record<string, string>,
    ecosystemKey: EcosystemKey,
  ) => Promise<ExecutionVerifySummary>;
  scan: (files: Record<string, string>) => { secrets: SecretFinding[]; staticIssues: string[] };
}

export interface RepoAuditReport {
  at: string;
  workspacePath: string;
  ecosystemKey: EcosystemKey;
  score: number;
  filesScanned: number;
  verification: ExecutionVerifySummary;
  security: { secrets: SecretFinding[]; staticIssues: string[] };
}

/**
 * Real baseline diagnostic: OS compiler/test execution plus the static
 * secret/vulnerability scanner over the isolated workspace copy.
 */
export async function auditIngestedRepo(
  input: { workspacePath: string; files: Record<string, string>; ecosystemKey: EcosystemKey },
  deps: RepoAuditDeps,
): Promise<RepoAuditReport> {
  const verification = await deps.verify(input.workspacePath, input.files, input.ecosystemKey);
  const security = deps.scan(input.files);
  return {
    at: new Date().toISOString(),
    workspacePath: input.workspacePath,
    ecosystemKey: input.ecosystemKey,
    score: computeHealingScore(input.files, verification),
    filesScanned: Object.keys(input.files).length,
    verification,
    security,
  };
}

// ── Run records (persisted through STORE_REPOSITORY) ────────────────────────

export type EvolveMode = 'harden-only' | 'develop-feature' | 'full-evolve';

export const EVOLVE_MODES: EvolveMode[] = ['harden-only', 'develop-feature', 'full-evolve'];

export type RepoRunStatus = 'audited' | 'promoted' | 'failed_closed' | 'no_changes';

export interface RepoRunSnapshot {
  score: number;
  testsExecuted: number;
  testsPassed: number;
  exitCode: number;
  ranRealTests: boolean;
  secrets: number;
  staticIssues: number;
}

export interface RepoIngestRun {
  id: string;
  kind: 'audit' | 'evolve';
  repoPath: string;
  mode?: EvolveMode;
  goal?: string;
  status: RepoRunStatus;
  errorCode?: string;
  errorDetail?: string;
  departmentIds: string[];
  fileCount: number;
  totalBytes: number;
  ecosystems: string[];
  ecosystemKey: EcosystemKey;
  baseline?: RepoRunSnapshot;
  final?: RepoRunSnapshot;
  changedFiles: string[];
  commitSha?: string;
  at: string;
}

export interface RepoIngestStore {
  load(): RepoIngestRun[];
  save(runs: RepoIngestRun[]): void;
}

function snapshotOf(report: RepoAuditReport): RepoRunSnapshot {
  return {
    score: report.score,
    testsExecuted: report.verification.testsExecuted,
    testsPassed: report.verification.testsPassed,
    exitCode: report.verification.exitCode,
    ranRealTests: report.verification.ranRealTests,
    secrets: report.security.secrets.length,
    staticIssues: report.security.staticIssues.length,
  };
}

/** Bounded append (newest first) so the store cannot grow without limit. */
export function recordIngestRun(store: RepoIngestStore | undefined, run: RepoIngestRun): void {
  if (!store) return;
  const runs = store.load();
  runs.unshift(run);
  store.save(runs.slice(0, MAX_PERSISTED_RUNS));
}

export function loadIngestRuns(store: RepoIngestStore | undefined): RepoIngestRun[] {
  return store ? store.load() : [];
}

// ── Synthesis contract (SEARCH/REPLACE patch batch) ─────────────────────────

function parsePatchBatch(raw: string): PatchRequest[] {
  const text = (raw || '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new RepoIngestError('PATCH_PARSE_FAILED', 'local model did not return a JSON patch batch');
    }
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      throw new RepoIngestError(
        'PATCH_PARSE_FAILED',
        `invalid patch JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const container = parsed as { patches?: unknown };
  if (!Array.isArray(container.patches)) {
    throw new RepoIngestError('PATCH_PARSE_FAILED', 'patch batch must contain a "patches" array');
  }

  const patches: PatchRequest[] = [];
  for (const item of container.patches.slice(0, MAX_PATCHES_PER_RUN)) {
    const candidate = item as { path?: unknown; search?: unknown; replace?: unknown; occurrence?: unknown };
    if (typeof candidate.path !== 'string' || typeof candidate.search !== 'string' || typeof candidate.replace !== 'string') {
      continue;
    }
    // Models commonly prefix with "./"; normalize, then fail closed if unsafe.
    const normalizedPath = candidate.path.trim().replace(/^\.\//, '').replace(/\\/g, '/');
    const safe = isSafeRelativePath(normalizedPath);
    if (!safe) {
      throw new RepoIngestError('UNSAFE_PATH', `patch path rejected: ${candidate.path}`);
    }
    const patch: PatchRequest = { path: safe, search: candidate.search, replace: candidate.replace };
    if (typeof candidate.occurrence === 'number' && Number.isInteger(candidate.occurrence)) {
      patch.occurrence = candidate.occurrence;
    }
    patches.push(patch);
  }
  return patches;
}

function buildEditableContext(
  files: Record<string, string>,
  baseline: RepoAuditReport,
  goal: string | undefined,
): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (rel: string | undefined): void => {
    if (!rel || seen.has(rel) || !(rel in files)) return;
    seen.add(rel);
    ordered.push(rel);
  };

  // Priority: files with real security findings, then tests, then goal matches,
  // then the remaining sources (alphabetical) until the budget is reached.
  for (const finding of baseline.security.secrets) push(finding.file);
  for (const issue of baseline.security.staticIssues) push(issue.split(':')[0]);
  for (const rel of Object.keys(files)) {
    if (path.basename(rel).startsWith('test')) push(rel);
  }
  if (goal) {
    const tokens = goal
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((token) => token.length > 3)
      .slice(0, 8);
    const scored = Object.keys(files)
      .map((rel) => ({
        rel,
        score: tokens.reduce((n, token) => n + (files[rel].toLowerCase().includes(token) ? 1 : 0), 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
    for (const entry of scored.slice(0, 6)) push(entry.rel);
  }
  for (const rel of Object.keys(files).sort()) {
    if (ordered.length >= 14) break;
    push(rel);
  }

  const blocks: string[] = [];
  let used = 0;
  for (const rel of ordered) {
    if (used >= MAX_CONTEXT_CHARS) break;
    const content = files[rel];
    const slice =
      content.length > MAX_CONTEXT_FILE_CHARS
        ? `${content.slice(0, MAX_CONTEXT_FILE_CHARS)}\n...[truncated]`
        : content;
    const block = `===== ${rel} =====\n${slice}`;
    if (used + block.length > MAX_CONTEXT_CHARS && blocks.length > 0) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n');
}

function buildEvolutionPrompt(params: {
  mode: EvolveMode;
  goal?: string;
  assignments: DepartmentAssignment[];
  ingest: RepoIngestResult;
  baseline: RepoAuditReport;
}): string {
  const { mode, goal, assignments, ingest, baseline } = params;
  const findings = [
    ...baseline.security.secrets.map((f) => `SECRET ${f.file}:${f.line} — ${f.type}`),
    ...baseline.security.staticIssues.map((issue) => `STATIC ${issue}`),
  ].slice(0, 12);

  const mission =
    mode === 'harden-only'
      ? 'Harden the existing repository: remove security findings and keep every test green. Do not change public behavior.'
      : mode === 'develop-feature'
        ? 'Implement the engineering goal inside the existing repository while keeping it verified and secure.'
        : 'Harden the repository and evolve it toward the engineering goal, keeping every test green.';

  return [
    `Mission: ${mode} — ${mission}`,
    `Engineering goal: ${goal || 'none supplied; harden and improve code quality only'}`,
    `Target repository: ${ingest.repoPath}`,
    `Detected ecosystem: ${ingest.ecosystemKey}${ingest.ecosystems.length ? ` (manifests: ${ingest.ecosystems.join(', ')})` : ''}`,
    `Active engineering departments: ${assignments.map((a) => a.department.id).join(', ')}`,
    `Active rules:\n${activeRules(assignments).slice(0, 20).join('\n')}`,
    `Verification gates:\n${verificationGates(assignments).slice(0, 12).join('\n')}`,
    [
      'Baseline audit (measured, not estimated):',
      `score=${baseline.score}`,
      `tests=${baseline.verification.testsPassed}/${baseline.verification.testsExecuted} exit=${baseline.verification.exitCode} runtime=${baseline.verification.runtime}`,
      `secrets=${baseline.security.secrets.length} staticIssues=${baseline.security.staticIssues.length}`,
      findings.length ? `findings:\n${findings.join('\n')}` : 'findings: none',
    ].join('\n'),
    `Repository symbol map:\n${ingest.indexPrompt}`,
    `Editable file excerpts (the only files you may patch; patches update existing files only):\n${buildEditableContext(ingest.files, baseline, goal)}`,
    'Return STRICT JSON only: {"patches":[{"path":"relative/file.ts","search":"exact existing text","replace":"replacement text","occurrence":1}]}',
    [
      'Rules:',
      '- `search` must be copied verbatim from the excerpts above and identify a unique location (set `occurrence` when it repeats).',
      '- Keep each change minimal; never rewrite a whole file.',
      '- Never introduce secrets, eval, exec, os.system, shell=True or hardcoded credentials.',
      '- Never patch a path outside the excerpts; the batch is rejected as a whole otherwise.',
      '- Return {"patches":[]} when nothing should change.',
    ].join('\n'),
  ].join('\n\n');
}

// ── Finding bookkeeping (line numbers may shift, files/types may not) ───────

function multisetKeys(values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return map;
}

function countAdded(before: Map<string, number>, after: string[]): number {
  const remaining = new Map(before);
  let added = 0;
  for (const value of after) {
    const left = remaining.get(value) || 0;
    if (left > 0) remaining.set(value, left - 1);
    else added += 1;
  }
  return added;
}

function secretKeys(findings: SecretFinding[]): string[] {
  return findings.map((finding) => `${finding.file}|${finding.type}`);
}

/** `path:12 — Label` -> `path — Label` so a shifted line is not "new". */
function staticKeys(issues: string[]): string[] {
  return issues.map((issue) => issue.replace(/:\d+\s+—\s+/, ' — '));
}

function boundedDiffs(before: Record<string, string>, after: Record<string, string>): DiffEntry[] {
  let budget = MAX_DIFF_CHARS;
  const out: DiffEntry[] = [];
  for (const entry of computeUnifiedDiffs(before, after)) {
    if (budget <= 0) break;
    if (entry.diffText.length > budget) {
      out.push({ ...entry, diffText: `${entry.diffText.slice(0, budget)}\n...[diff truncated]` });
      break;
    }
    out.push(entry);
    budget -= entry.diffText.length;
  }
  return out;
}

// ── Atomic promotion ────────────────────────────────────────────────────────

interface PromoteResult {
  ok: boolean;
  error?: string;
}

/**
 * Copy verified files back into the original repository. Every destination is
 * validated before the first write, and any write failure rolls back the files
 * already written so the repository returns to its pre-run bytes.
 */
function promoteFiles(
  repoRoot: string,
  changed: string[],
  next: Record<string, string>,
  original: Record<string, string>,
): PromoteResult {
  const destinations: Array<{ abs: string; content: string; rollback: string }> = [];
  for (const rel of changed) {
    const safe = isSafeRelativePath(rel);
    if (!safe) return { ok: false, error: `unsafe promotion path: ${rel}` };
    const abs = path.resolve(repoRoot, safe);
    if (!abs.startsWith(repoRoot + path.sep)) {
      return { ok: false, error: `path escaped the repository boundary: ${rel}` };
    }
    if (!fs.existsSync(abs)) return { ok: false, error: `original file vanished: ${rel}` };
    destinations.push({ abs, content: next[rel], rollback: original[rel] });
  }

  const written: typeof destinations = [];
  try {
    for (const destination of destinations) {
      fs.writeFileSync(destination.abs, destination.content, 'utf-8');
      written.push(destination);
    }
  } catch (err) {
    for (const destination of written) {
      try {
        fs.writeFileSync(destination.abs, destination.rollback, 'utf-8');
      } catch {
        // best-effort rollback; the failure is reported to the caller
      }
    }
    return { ok: false, error: `promotion write failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true };
}

async function commitPromotion(
  repoRoot: string,
  changed: string[],
  mode: EvolveMode,
): Promise<{ sha?: string; error?: string }> {
  try {
    const env = buildDeployEnv();
    for (let i = 0; i < changed.length; i += MAX_GIT_PATHS_PER_CALL) {
      const slice = changed.slice(i, i + MAX_GIT_PATHS_PER_CALL);
      await execFileAsync('git', ['add', '--', ...slice], { cwd: repoRoot, env, timeout: 15_000 });
    }
    const message = sanitizeCommitMessage(
      `feat(ingest): ${mode} promotion verified by GENESIS-OMEGA`,
      path.basename(repoRoot),
    );
    await execFileAsync('git', ['commit', '-m', message, '--', ...changed.slice(0, MAX_GIT_PATHS_PER_CALL)], {
      cwd: repoRoot,
      env,
      timeout: 30_000,
    });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      env,
      timeout: 10_000,
    });
    return { sha: stdout.trim() };
  } catch (err) {
    // The verified files are already promoted; the commit is best-effort
    // metadata and its failure is reported, never hidden.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Evolution ───────────────────────────────────────────────────────────────

export type RepoIngestStage =
  | 'VALIDATED'
  | 'INGESTED'
  | 'BASELINE_AUDIT'
  | 'DEPARTMENTS'
  | 'PATCH_GENERATION'
  | 'PATCH_APPLIED'
  | 'OS_VERIFICATION'
  | 'SECURITY_AUDIT'
  | 'SELF_HEALING'
  | 'PROMOTED'
  | 'NO_CHANGES'
  | 'FAILED_CLOSED';

export interface RepoIngestEvent {
  type: 'repo_ingest.stage';
  runId: string;
  stage: RepoIngestStage;
  at: string;
  detail: string;
  errorCode?: string;
}

export interface RepoIngestDeps extends RepoAuditDeps {
  synthesize: (params: {
    role: BrainRole;
    title: string;
    prompt: string;
    signal?: AbortSignal;
  }) => Promise<LocalTextSynthesisOutput>;
  heal?: (params: {
    files: Record<string, string>;
    workspaceDir: string;
    verification: ExecutionVerifySummary;
    ecosystemKey: EcosystemKey;
  }) => Promise<{ files: Record<string, string>; report: HealingReport } | null>;
  store?: RepoIngestStore;
  onEvent?: (event: RepoIngestEvent) => void;
}

export interface EvolveOptions {
  repoPath: string;
  mode: EvolveMode;
  goal?: string;
  autoCommit?: boolean;
  signal?: AbortSignal;
  workspaceRoot?: string;
}

export interface EvolutionOutcome {
  runId: string;
  status: RepoRunStatus;
  mode: EvolveMode;
  repoPath: string;
  goal?: string;
  errorCode?: string;
  errorDetail?: string;
  brainRole?: BrainRole;
  departments: Array<{ id: string; score: number }>;
  baseline: RepoAuditReport | null;
  final: RepoAuditReport | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  fileCount: number;
  totalBytes: number;
  ecosystems: string[];
  ecosystemKey: EcosystemKey | null;
  changedFiles: string[];
  diffs: DiffEntry[];
  patchFailures: PatchFailure[];
  healing?: HealingReport;
  commitSha?: string;
  commitError?: string;
  stages: RepoIngestEvent[];
  startedAt: string;
  finishedAt: string;
}

let RUN_SEQUENCE = 0;

/**
 * Ingest, audit, evolve and harden an existing local repository with an atomic
 * promotion gate. Never throws: every failure is an explicit FAILED_CLOSED
 * outcome with diagnostics, and the original files stay byte-for-byte identical.
 */
export async function evolveAndHardenRepo(
  options: EvolveOptions,
  deps: RepoIngestDeps,
): Promise<EvolutionOutcome> {
  const runId = `ing-${Date.now()}-${++RUN_SEQUENCE}`;
  const startedAt = new Date().toISOString();
  const stages: RepoIngestEvent[] = [];
  const emit = (stage: RepoIngestStage, detail: string, errorCode?: string): void => {
    const event: RepoIngestEvent = {
      type: 'repo_ingest.stage',
      runId,
      stage,
      at: new Date().toISOString(),
      detail,
      errorCode,
    };
    stages.push(event);
    deps.onEvent?.(event);
  };

  const outcome: EvolutionOutcome = {
    runId,
    status: 'failed_closed',
    mode: options.mode,
    repoPath: (options.repoPath || '').trim(),
    goal: options.goal,
    departments: [],
    baseline: null,
    final: null,
    scoreBefore: null,
    scoreAfter: null,
    fileCount: 0,
    totalBytes: 0,
    ecosystems: [],
    ecosystemKey: null,
    changedFiles: [],
    diffs: [],
    patchFailures: [],
    stages,
    startedAt,
    finishedAt: '',
  };

  const fail = (code: string, detail: string): void => {
    outcome.status = 'failed_closed';
    outcome.errorCode = code;
    outcome.errorDetail = detail;
    emit('FAILED_CLOSED', `${code}: ${detail}`, code);
  };

  let workspacePath = '';

  const execute = async (): Promise<void> => {
    if (!EVOLVE_MODES.includes(options.mode)) {
      fail('INVALID_MODE', `unknown evolution mode: ${String(options.mode)}`);
      return;
    }
    if (options.mode === 'develop-feature' && !String(options.goal || '').trim()) {
      fail('GOAL_REQUIRED', 'develop-feature requires an explicit engineering goal');
      return;
    }

    const validation = validateRepoRoot(options.repoPath);
    if (!validation.ok) {
      fail(validation.code || 'UNSAFE_REPO_PATH', validation.message);
      return;
    }
    outcome.repoPath = validation.resolved;
    emit('VALIDATED', validation.resolved);

    let ingest: RepoIngestResult;
    try {
      ingest = ingestLocalRepository(validation.resolved, { workspaceRoot: options.workspaceRoot });
    } catch (err) {
      fail(
        err instanceof RepoIngestError ? err.code : 'INGEST_FAILED',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    workspacePath = ingest.workspacePath;
    outcome.fileCount = ingest.totalFiles;
    outcome.totalBytes = ingest.totalBytes;
    outcome.ecosystems = ingest.ecosystems;
    outcome.ecosystemKey = ingest.ecosystemKey;
    emit(
      'INGESTED',
      `files=${ingest.totalFiles} bytes=${ingest.totalBytes} excluded=${ingest.excluded.length} truncated=${ingest.truncated}`,
    );

    // 1. Baseline: real OS verification + real static security scan.
    const baseline = await auditIngestedRepo(
      { workspacePath: ingest.workspacePath, files: ingest.files, ecosystemKey: ingest.ecosystemKey },
      deps,
    );
    outcome.baseline = baseline;
    outcome.scoreBefore = baseline.score;
    emit(
      'BASELINE_AUDIT',
      `score=${baseline.score} tests=${baseline.verification.testsPassed}/${baseline.verification.testsExecuted} exit=${baseline.verification.exitCode} secrets=${baseline.security.secrets.length} staticIssues=${baseline.security.staticIssues.length}`,
    );

    // 2. Deterministic department classification for the requested mission.
    const departmentInput: DepartmentInput = {
      title: `${options.mode} ${options.goal || ''}`.trim(),
      problemStatement: options.goal || `harden and evolve the existing repository at ${validation.resolved}`,
      targetLang: ingest.ecosystemKey,
    };
    const assignments = classifyDepartments(departmentInput);
    outcome.departments = assignments.map((a) => ({ id: a.department.id, score: a.score }));
    emit('DEPARTMENTS', assignments.map((a) => a.department.id).join(','));

    if (options.signal?.aborted) {
      fail('ABORTED', 'aborted before local synthesis');
      return;
    }

    // 3. Local-only patch generation (coder/healer brain profile, fail-closed).
    const role: BrainRole = options.mode === 'harden-only' ? 'healer' : 'coder';
    outcome.brainRole = role;
    const prompt = buildEvolutionPrompt({ mode: options.mode, goal: options.goal, assignments, ingest, baseline });
    const synthesis = await deps.synthesize({
      role,
      title: `repository ${options.mode}`,
      prompt,
      signal: options.signal,
    });
    if (synthesis.error || !synthesis.text.trim()) {
      fail(
        synthesis.errorCode || 'PATCH_GENERATION_FAILED',
        synthesis.error || 'local model returned an empty patch batch',
      );
      return;
    }
    emit('PATCH_GENERATION', `model=${synthesis.modelUsed}`);

    let patches: PatchRequest[];
    try {
      patches = parsePatchBatch(synthesis.text);
    } catch (err) {
      fail(
        err instanceof RepoIngestError ? err.code : 'PATCH_PARSE_FAILED',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (patches.length === 0) {
      outcome.status = 'no_changes';
      outcome.errorDetail = 'the local model proposed no applicable change';
      emit('NO_CHANGES', outcome.errorDetail);
      return;
    }

    // 4. Surgical application inside memory; nothing touches disk yet.
    const applied = applySurgicalPatches(ingest.files, patches);
    outcome.patchFailures = applied.failures;
    if (!applied.ok) {
      fail(
        'PATCH_REJECTED',
        applied.failures
          .map((failure) => `${failure.path}: ${failure.code} — ${failure.message}`)
          .slice(0, 6)
          .join(' | ') || 'patch batch rejected',
      );
      return;
    }
    emit('PATCH_APPLIED', `files=${applied.changedFiles.join(',')}`);

    if (options.signal?.aborted) {
      fail('ABORTED', 'aborted before OS verification');
      return;
    }

    // 5. Re-verify on the real OS runner, then re-scan.
    let candidate = applied.files;
    let verification = await deps.verify(ingest.workspacePath, candidate, ingest.ecosystemKey);
    emit(
      'OS_VERIFICATION',
      `exit=${verification.exitCode} tests=${verification.testsPassed}/${verification.testsExecuted}`,
    );
    let security = deps.scan(candidate);
    emit('SECURITY_AUDIT', `secrets=${security.secrets.length} staticIssues=${security.staticIssues.length}`);

    // 6. Self-healing when tests fail or security findings remain.
    let healing: HealingReport | undefined;
    const needsHealing =
      verification.exitCode !== 0 || security.secrets.length > 0 || security.staticIssues.length > 0;
    if (needsHealing && deps.heal) {
      emit(
        'SELF_HEALING',
        `reason=${verification.exitCode !== 0 ? 'os_verification_failed' : 'security_findings_remaining'}`,
      );
      const healed = await deps.heal({
        files: candidate,
        workspaceDir: ingest.workspacePath,
        verification,
        ecosystemKey: ingest.ecosystemKey,
      });
      if (healed) {
        candidate = healed.files;
        healing = healed.report;
        verification = await deps.verify(ingest.workspacePath, candidate, ingest.ecosystemKey);
        security = deps.scan(candidate);
        emit(
          'OS_VERIFICATION',
          `after healing exit=${verification.exitCode} tests=${verification.testsPassed}/${verification.testsExecuted}`,
        );
        emit(
          'SECURITY_AUDIT',
          `after healing secrets=${security.secrets.length} staticIssues=${security.staticIssues.length}`,
        );
      } else {
        emit('SELF_HEALING', 'exhausted: no candidate passed the real verifier');
      }
    }
    outcome.healing = healing;

    const scoreAfter = computeHealingScore(candidate, verification);
    outcome.scoreAfter = scoreAfter;
    outcome.final = {
      at: new Date().toISOString(),
      workspacePath: ingest.workspacePath,
      ecosystemKey: ingest.ecosystemKey,
      score: scoreAfter,
      filesScanned: Object.keys(candidate).length,
      verification,
      security,
    };

    const changedFiles = Object.keys(candidate)
      .filter((rel) => candidate[rel] !== ingest.files[rel])
      .sort();
    outcome.changedFiles = changedFiles;
    outcome.diffs = boundedDiffs(ingest.files, candidate);

    if (changedFiles.length === 0) {
      outcome.status = 'no_changes';
      outcome.errorDetail = 'candidate files are byte-identical to the originals';
      emit('NO_CHANGES', outcome.errorDetail);
      return;
    }

    // 7. Atomic promotion gate: score holds/improves AND no new finding AND
    //    no test regression — otherwise FAILED_CLOSED with diagnostics.
    const newSecrets = countAdded(multisetKeys(secretKeys(baseline.security.secrets)), secretKeys(security.secrets));
    const newStatic = countAdded(multisetKeys(staticKeys(baseline.security.staticIssues)), staticKeys(security.staticIssues));
    const testRegression =
      verification.testsPassed < baseline.verification.testsPassed ||
      (baseline.verification.exitCode === 0 && verification.exitCode !== 0);

    const reasons: string[] = [];
    if (scoreAfter < baseline.score) {
      reasons.push(`score ${baseline.score} -> ${scoreAfter} (must not decrease)`);
    }
    if (newSecrets > 0) reasons.push(`new secret findings: ${newSecrets}`);
    if (newStatic > 0) reasons.push(`new static issues: ${newStatic}`);
    if (testRegression) {
      reasons.push(
        `test regression ${baseline.verification.testsPassed} -> ${verification.testsPassed} (exit ${baseline.verification.exitCode} -> ${verification.exitCode})`,
      );
    }
    if (reasons.length > 0) {
      fail('PROMOTION_GATE_REJECTED', reasons.join('; '));
      return;
    }

    if (options.signal?.aborted) {
      fail('ABORTED', 'aborted before promotion');
      return;
    }

    // 8. Promote (only now do the originals change), then optional git commit.
    const promoted = promoteFiles(validation.resolved, changedFiles, candidate, ingest.files);
    if (!promoted.ok) {
      fail('PROMOTION_WRITE_FAILED', promoted.error || 'promotion failed');
      return;
    }

    if (options.autoCommit && fs.existsSync(path.join(validation.resolved, '.git'))) {
      const commit = await commitPromotion(validation.resolved, changedFiles, options.mode);
      outcome.commitSha = commit.sha;
      outcome.commitError = commit.error;
    }

    outcome.status = 'promoted';
    emit(
      'PROMOTED',
      `files=${changedFiles.length} score=${baseline.score} -> ${scoreAfter}` +
        (outcome.commitSha ? ` commit=${outcome.commitSha}` : outcome.commitError ? ` commitError=${outcome.commitError}` : ''),
    );
  };

  try {
    await execute();
  } catch (err) {
    fail(
      err instanceof RepoIngestError ? err.code : 'UNEXPECTED_ERROR',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    if (workspacePath) removeIngestWorkspace(workspacePath);
  }

  outcome.finishedAt = new Date().toISOString();
  recordIngestRun(deps.store, {
    id: outcome.runId,
    kind: 'evolve',
    repoPath: outcome.repoPath,
    mode: outcome.mode,
    goal: outcome.goal,
    status: outcome.status,
    errorCode: outcome.errorCode,
    errorDetail: outcome.errorDetail,
    departmentIds: outcome.departments.map((d) => d.id),
    fileCount: outcome.fileCount,
    totalBytes: outcome.totalBytes,
    ecosystems: outcome.ecosystems,
    ecosystemKey: outcome.ecosystemKey || 'python',
    baseline: outcome.baseline ? snapshotOf(outcome.baseline) : undefined,
    final: outcome.final ? snapshotOf(outcome.final) : undefined,
    changedFiles: outcome.changedFiles,
    commitSha: outcome.commitSha,
    at: outcome.finishedAt,
  });
  return outcome;
}

// ── High-level audit entry point (used by the HTTP route) ───────────────────

export interface IngestAuditSummary {
  repoPath: string;
  workspacePath: string;
  manifest: IngestedFile[];
  excluded: ExcludedFile[];
  warnings: string[];
  totalFiles: number;
  totalBytes: number;
  truncated: boolean;
  ecosystems: string[];
  ecosystemKey: EcosystemKey;
  index: RepoIndexSummary;
  at: string;
}

export interface IngestAuditResult {
  run: RepoIngestRun;
  summary: IngestAuditSummary;
  report: RepoAuditReport;
}

/**
 * Validate + ingest + baseline-audit an existing repository, persist the run
 * and always remove the isolated workspace. Throws `RepoIngestError`.
 */
export async function ingestAndAuditLocalRepository(
  repoPath: string,
  deps: RepoAuditDeps & { store?: RepoIngestStore },
): Promise<IngestAuditResult> {
  const validation = validateRepoRoot(repoPath);
  if (!validation.ok) {
    throw new RepoIngestError(validation.code || 'UNSAFE_REPO_PATH', validation.message);
  }

  const ingest = ingestLocalRepository(validation.resolved);
  try {
    const report = await auditIngestedRepo(
      { workspacePath: ingest.workspacePath, files: ingest.files, ecosystemKey: ingest.ecosystemKey },
      deps,
    );
    const run: RepoIngestRun = {
      id: `ing-${Date.now()}-${++RUN_SEQUENCE}`,
      kind: 'audit',
      repoPath: ingest.repoPath,
      status: 'audited',
      departmentIds: [],
      fileCount: ingest.totalFiles,
      totalBytes: ingest.totalBytes,
      ecosystems: ingest.ecosystems,
      ecosystemKey: ingest.ecosystemKey,
      baseline: snapshotOf(report),
      changedFiles: [],
      at: report.at,
    };
    recordIngestRun(deps.store, run);
    return {
      run,
      report,
      summary: {
        repoPath: ingest.repoPath,
        workspacePath: ingest.workspacePath,
        manifest: ingest.manifest,
        excluded: ingest.excluded,
        warnings: ingest.warnings,
        totalFiles: ingest.totalFiles,
        totalBytes: ingest.totalBytes,
        truncated: ingest.truncated,
        ecosystems: ingest.ecosystems,
        ecosystemKey: ingest.ecosystemKey,
        index: ingest.index,
        at: ingest.at,
      },
    };
  } finally {
    removeIngestWorkspace(ingest.workspacePath);
  }
}
