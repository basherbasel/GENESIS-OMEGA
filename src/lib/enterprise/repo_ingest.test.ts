/**
 * v2.0 Phase 3 — real repository ingestion, baseline auditing and atomic
 * evolution/hardening tests.
 *
 * Every case runs against real temporary repositories on disk with the real
 * OS verifier (`node --test`) and the real static security scanner. No mocks
 * of hashing, verification or scanning: only the local bridge synthesis is
 * injected, exactly as the server injects the guarded bridge.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scanSecretsAndSecurity, sha256Hex } from '../security';
import { verifyProjectWorkspace } from '../verifier';
import type { EcosystemKey } from '../types';
import {
  RepoIngestError,
  auditIngestedRepo,
  evolveAndHardenRepo,
  ingestAndAuditLocalRepository,
  ingestLocalRepository,
  removeIngestWorkspace,
  validateRepoRoot,
  type RepoIngestDeps,
  type RepoIngestRun,
} from './repo_ingest';

const realDeps = {
  verify: (workspaceDir: string, files: Record<string, string>, ecosystemKey: EcosystemKey) =>
    verifyProjectWorkspace(workspaceDir, files, ecosystemKey),
  scan: scanSecretsAndSecurity,
};

function fakeSynthesis(text: string): RepoIngestDeps['synthesize'] {
  return async () => ({ engine: 'ollama-bridge', modelUsed: 'test-local-model', text });
}

function failingSynthesis(errorCode: string, error: string): RepoIngestDeps['synthesize'] {
  return async () => ({ engine: 'ollama-bridge', modelUsed: 'test-local-model', text: '', errorCode, error });
}

/** Real Node.js fixture repository: 2 passing tests + 1 hardcoded secret. */
function makeFixture(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-fixture-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'data', 'voice_cache'), { recursive: true });

  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'omega-fixture', private: true, type: 'module' }, null, 2) + '\n',
    'utf-8',
  );
  fs.writeFileSync(path.join(repo, 'README.md'), '# omega fixture\n', 'utf-8');
  fs.writeFileSync(
    path.join(repo, 'src', 'math.js'),
    ['export function add(a, b) {', '  return a + b;', '}', '', 'export function multiply(a, b) {', '  return a * b;', '}', ''].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(repo, 'src', 'config.js'),
    [
      'const db_password = "supersecret123";',
      'const host = "localhost";',
      '',
      'export function connectionInfo() {',
      '  return { user: "app", host: host };',
      '}',
      '',
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(repo, 'test_math.test.js'),
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add, multiply } from './src/math.js';",
      '',
      "test('add two numbers', () => {",
      '  assert.equal(add(2, 3), 5);',
      '});',
      '',
      "test('multiply two numbers', () => {",
      '  assert.equal(multiply(2, 3), 6);',
      '});',
      '',
    ].join('\n'),
    'utf-8',
  );
  // Heavy/build directories that must never be ingested.
  fs.writeFileSync(path.join(repo, '.git', 'config'), '[core]\n', 'utf-8');
  fs.writeFileSync(path.join(repo, 'node_modules', 'dep', 'index.js'), 'export default 1;\n', 'utf-8');
  fs.writeFileSync(path.join(repo, 'data', 'voice_cache', 'cached.txt'), 'cache\n', 'utf-8');
  return repo;
}

function snapshotHashes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        out[rel] = sha256Hex(fs.readFileSync(full, 'utf-8'));
      }
    }
  };
  walk(root);
  return out;
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('path guard rejects OS system roots, drive-relative and traversal inputs', () => {
  const windows = validateRepoRoot('C:\\Windows');
  assert.equal(windows.ok, false);
  assert.equal(windows.code, 'UNSAFE_REPO_PATH');

  const etc = validateRepoRoot('/etc');
  assert.equal(etc.ok, false);
  assert.equal(etc.code, 'UNSAFE_REPO_PATH');

  const programFiles = validateRepoRoot('C:\\Program Files');
  assert.equal(programFiles.ok, false);
  assert.equal(programFiles.code, 'UNSAFE_REPO_PATH');

  const traversal = validateRepoRoot('..\\..\\Windows\\System32');
  assert.equal(traversal.ok, false);
  assert.equal(traversal.code, 'UNSAFE_REPO_PATH');

  const posixTraversal = validateRepoRoot('/etc/../etc');
  assert.equal(posixTraversal.ok, false);
  assert.equal(posixTraversal.code, 'UNSAFE_REPO_PATH');

  const driveRelative = validateRepoRoot('C:temp');
  assert.equal(driveRelative.ok, false);
  assert.equal(driveRelative.code, 'UNSAFE_REPO_PATH');

  const missing = validateRepoRoot(path.join(os.tmpdir(), 'omega-definitely-missing-repo-12345'));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'REPO_NOT_FOUND');

  const file = validateRepoRoot(path.join(process.cwd(), 'package.json'));
  assert.equal(file.ok, false);
  assert.equal(file.code, 'REPO_NOT_FOUND');

  const repo = makeFixture();
  try {
    const valid = validateRepoRoot(repo);
    assert.equal(valid.ok, true);
    assert.equal(valid.resolved, fs.realpathSync(repo));
  } finally {
    removeDir(repo);
  }
});

test('real repository ingestion computes accurate SHA-256 digests and a real baseline audit', async () => {
  const repo = makeFixture();
  let workspace = '';
  try {
    const ingest = ingestLocalRepository(repo);
    workspace = ingest.workspacePath;

    const paths = ingest.manifest.map((entry) => entry.path);
    assert.ok(paths.includes('src/math.js'));
    assert.ok(paths.includes('test_math.test.js'));
    assert.ok(paths.includes('package.json'));
    // Heavy/build directories are skipped.
    assert.equal(paths.some((p) => p.includes('node_modules')), false);
    assert.equal(paths.some((p) => p.startsWith('.git/')), false);
    assert.equal(paths.some((p) => p.includes('voice_cache')), false);

    for (const entry of ingest.manifest) {
      const onDisk = fs.readFileSync(path.join(repo, entry.path), 'utf-8');
      assert.equal(entry.sha256, sha256Hex(onDisk), `sha256 mismatch for ${entry.path}`);
      assert.equal(entry.bytes, Buffer.byteLength(onDisk, 'utf-8'), `byte count mismatch for ${entry.path}`);
      assert.ok(entry.lines > 0);
    }

    assert.equal(ingest.ecosystemKey, 'nodejs');
    assert.ok(ingest.index.symbols > 0, 'symbol map must extract real symbols');
    assert.ok(ingest.indexPrompt.includes('src/math.js'));

    // The isolated workspace is a real copy; the source stays authoritative.
    assert.equal(fs.existsSync(path.join(workspace, 'src', 'math.js')), true);
    assert.equal(
      sha256Hex(fs.readFileSync(path.join(workspace, 'src', 'math.js'), 'utf-8')),
      ingest.manifest.find((entry) => entry.path === 'src/math.js')!.sha256,
    );

    const report = await auditIngestedRepo(
      { workspacePath: workspace, files: ingest.files, ecosystemKey: ingest.ecosystemKey },
      realDeps,
    );
    assert.equal(report.verification.ranRealTests, true);
    assert.equal(report.verification.runtime, 'node');
    assert.equal(report.verification.exitCode, 0);
    assert.equal(report.verification.testsExecuted, 2);
    assert.equal(report.verification.testsPassed, 2);
    assert.equal(report.security.secrets.length, 1, 'the fixture contains exactly one hardcoded secret');
    assert.equal(report.security.staticIssues.length, 0);
    assert.ok(report.score < 97 && report.score >= 35, `baseline score must reflect the finding: ${report.score}`);
  } finally {
    if (workspace) removeIngestWorkspace(workspace);
    removeDir(repo);
  }
});

test('autonomous hardening passes real OS verification and promotes atomically', async () => {
  const repo = makeFixture();
  try {
    const before = snapshotHashes(repo);
    const outcome = await evolveAndHardenRepo(
      { repoPath: repo, mode: 'harden-only' },
      {
        ...realDeps,
        synthesize: fakeSynthesis(
          JSON.stringify({
            patches: [
              {
                path: 'src/config.js',
                search: 'const db_password = "supersecret123";',
                replace: 'const db_password = process.env.DB_PASSWORD ?? "";',
              },
            ],
          }),
        ),
      },
    );

    assert.equal(outcome.status, 'promoted', `expected promotion, got ${outcome.errorCode}: ${outcome.errorDetail}`);
    assert.equal(outcome.errorCode, undefined);
    assert.ok(outcome.baseline, 'baseline report required');
    assert.ok(outcome.final, 'final report required');
    assert.equal(outcome.baseline!.security.secrets.length, 1);
    assert.equal(outcome.final!.security.secrets.length, 0);
    assert.ok(
      outcome.scoreAfter! > outcome.scoreBefore!,
      `score must improve: ${outcome.scoreBefore} -> ${outcome.scoreAfter}`,
    );
    assert.deepEqual(outcome.changedFiles, ['src/config.js']);
    assert.ok(outcome.diffs.length > 0);
    assert.equal(outcome.final!.verification.testsPassed, 2);
    assert.equal(outcome.final!.verification.exitCode, 0);
    assert.equal(outcome.stages.some((stage) => stage.stage === 'PROMOTED'), true);

    // Promoted on disk, everything else byte-for-byte untouched.
    const promoted = fs.readFileSync(path.join(repo, 'src', 'config.js'), 'utf-8');
    assert.ok(promoted.includes('process.env.DB_PASSWORD'));
    assert.equal(promoted.includes('supersecret123'), false);
    const after = snapshotHashes(repo);
    assert.equal(after['src/math.js'], before['src/math.js']);
    assert.equal(after['test_math.test.js'], before['test_math.test.js']);
    assert.equal(after['package.json'], before['package.json']);

    // Isolated workspace is always removed after the run.
    assert.equal(fs.existsSync(outcome.baseline!.workspacePath), false);
  } finally {
    removeDir(repo);
  }
});

test('a patch that breaks tests fails closed and leaves originals byte-for-byte identical', async () => {
  const repo = makeFixture();
  try {
    const before = snapshotHashes(repo);
    const outcome = await evolveAndHardenRepo(
      { repoPath: repo, mode: 'harden-only' },
      {
        ...realDeps,
        synthesize: fakeSynthesis(
          JSON.stringify({
            patches: [
              {
                path: 'test_math.test.js',
                search: 'assert.equal(add(2, 3), 5);',
                replace: 'assert.equal(add(2, 3), 999);',
              },
            ],
          }),
        ),
        // No healer available: the broken candidate must be rejected as-is.
      },
    );

    assert.equal(outcome.status, 'failed_closed');
    assert.equal(outcome.errorCode, 'PROMOTION_GATE_REJECTED');
    assert.match(String(outcome.errorDetail), /test regression|score/);
    assert.equal(outcome.stages.some((stage) => stage.stage === 'FAILED_CLOSED'), true);
    // Nothing was promoted: every original file keeps its exact bytes.
    assert.deepEqual(snapshotHashes(repo), before);
  } finally {
    removeDir(repo);
  }
});

test('a local bridge failure fails closed without touching the repository', async () => {
  const repo = makeFixture();
  try {
    const before = snapshotHashes(repo);
    const outcome = await evolveAndHardenRepo(
      { repoPath: repo, mode: 'harden-only' },
      { ...realDeps, synthesize: failingSynthesis('TIMEOUT', 'Generation exceeded the configured timeout.') },
    );

    assert.equal(outcome.status, 'failed_closed');
    assert.equal(outcome.errorCode, 'TIMEOUT');
    assert.equal(outcome.changedFiles.length, 0);
    assert.deepEqual(snapshotHashes(repo), before);
  } finally {
    removeDir(repo);
  }
});

test('audit entry point persists a bounded run record and rejects unsafe roots', async () => {
  const runs: RepoIngestRun[] = [];
  const store = {
    load: () => runs,
    save: (next: RepoIngestRun[]) => {
      runs.length = 0;
      runs.push(...next);
    },
  };

  await assert.rejects(
    () => ingestAndAuditLocalRepository('C:\\Windows', { ...realDeps, store }),
    (err: unknown) => err instanceof RepoIngestError && err.code === 'UNSAFE_REPO_PATH',
    'system root must be rejected with an explicit code',
  );

  const repo = makeFixture();
  try {
    const result = await ingestAndAuditLocalRepository(repo, { ...realDeps, store });
    assert.equal(result.summary.repoPath, fs.realpathSync(repo));
    assert.equal(result.summary.totalFiles, 5);
    assert.equal(result.report.verification.testsPassed, 2);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].kind, 'audit');
    assert.equal(runs[0].status, 'audited');
    assert.equal(runs[0].baseline?.testsPassed, 2);
    assert.equal(runs[0].baseline?.secrets, 1);
    // Workspace removed as soon as the audit is reported.
    assert.equal(fs.existsSync(result.summary.workspacePath), false);
  } finally {
    removeDir(repo);
  }
});
