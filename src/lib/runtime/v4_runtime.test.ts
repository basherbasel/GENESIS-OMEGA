import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseStrictModelOutput,
  StrictOutputError,
  verifyImportsAndSymbols,
} from '../brains/anti_hallucination';
import type { RepoIndex } from '../brains/repo_indexer';
import { DEDICATED_BRAIN_TAGS, resolveBrainModel } from '../brains/brain_registry';
import { IncrementalArtifactCache, contentDigest, pruneContextForLocalModel, runFastFailSyntaxGate, type MetaStore } from './fast_cache';
import {
  errorSignatureOf,
  HealCycleBreaker,
  killProcessTree,
  sweepStaleWorkspaces,
} from './resilience_guard';

function memoryStore(): MetaStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getMetaValue: (key) => values.get(key) || null,
    setMetaValue: (key, value) => {
      values.set(key, value);
    },
  };
}

const index: RepoIndex = {
  root: '/fixture',
  files: [{ path: 'lib/math.js', bytes: 80, lines: 5, language: 'javascript', imports: [], symbols: [
    { kind: 'function', name: 'add', file: 'lib/math.js', line: 1, endLine: 3 },
  ] }],
  symbols: [{ kind: 'function', name: 'add', file: 'lib/math.js', line: 1, endLine: 3 }],
  truncated: false,
  warnings: [],
};

test('dedicated omega-* brains resolve when installed and fall back cleanly', () => {
  const all = new Set(Object.values(DEDICATED_BRAIN_TAGS));
  for (const role of Object.keys(DEDICATED_BRAIN_TAGS) as Array<keyof typeof DEDICATED_BRAIN_TAGS>) {
    assert.equal(resolveBrainModel(role, all), DEDICATED_BRAIN_TAGS[role]);
  }
  const fallback = resolveBrainModel('auditor', new Set<string>());
  assert.match(fallback, /^qwen2\.5-coder:/);
});

test('grounding rejects hallucinated relative imports and phantom internal symbols', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-ground-'));
  try {
    const bad = verifyImportsAndSymbols({
      workspaceDir: dir,
      generatedFiles: {
        'src/app.js': "import { missing } from './does-not-exist.js';\nadd(1, 2);\n",
      },
      repoIndex: index,
    });
    assert.equal(bad.blocked, true);
    assert.ok(bad.findings.some((f) => f.code === 'HALLUCINATED_IMPORT' && f.line === 1));
    assert.ok(bad.findings.some((f) => f.code === 'UNRESOLVED_SYMBOL' && f.value === 'add'));

    const clean = verifyImportsAndSymbols({
      workspaceDir: dir,
      generatedFiles: { 'src/app.js': "import { add } from '../lib/math.js';\nadd(1, 2);\n" },
      repoIndex: index,
    });
    assert.equal(clean.blocked, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('strict model parser strips fences, validates schema and rejects missing patch anchors', () => {
  const parsed = parseStrictModelOutput(
    '```json\n{"patches":[{"path":"a.js","search":"const x = 1;","replace":"const x = 2;"}]}\n```',
    (value) => value as { patches: Array<{ path: string; search: string; replace: string }> },
    { files: { 'a.js': 'const x = 1;\n' } },
  );
  assert.equal(parsed.patches[0].replace, 'const x = 2;');
  assert.throws(
    () => parseStrictModelOutput('{bad json', (value) => value),
    (err: unknown) => err instanceof StrictOutputError && err.code === 'STRICT_JSON_FAILED',
  );
  assert.throws(
    () => parseStrictModelOutput(
      '{"patches":[{"path":"a.js","search":"NOT PRESENT","replace":"x"}]}',
      (value) => value as { patches: Array<{ path: string; search: string; replace: string }> },
      { files: { 'a.js': 'const x = 1;\n' } },
    ),
    (err: unknown) => err instanceof StrictOutputError && err.code === 'PATCH_ANCHOR_MISSING',
  );
});

test('SHA-256 cache hits on unchanged bytes and misses immediately after one byte changes', () => {
  const store = memoryStore();
  const cache = new IncrementalArtifactCache(store);
  const files = { 'a.js': 'export const a = 1;\n' };
  const first = cache.getOrCompute('taint', files, 'v4', () => ({ findings: 1 }));
  const second = cache.getOrCompute('taint', files, 'v4', () => ({ findings: 99 }));
  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.deepEqual(second.value, { findings: 1 });
  assert.ok(cache.stats().savedMs >= 0);

  const changed = { 'a.js': 'export const a = 2;\n' };
  assert.notEqual(contentDigest(files, 'taint', 'v4'), contentDigest(changed, 'taint', 'v4'));
  const third = cache.getOrCompute('taint', changed, 'v4', () => ({ findings: 2 }));
  assert.equal(third.hit, false);
  assert.deepEqual(third.value, { findings: 2 });
  assert.ok(store.values.size >= 2);
});

test('context pruner keeps full target source and collapses untouched files', () => {
  const slice = pruneContextForLocalModel({
    files: {
      'target.js': 'function target() { return 1; }\n'.repeat(4),
      'other.js': 'function other() { return 2; }\n'.repeat(4),
    },
    targetFile: 'target.js',
    blastRadiusFiles: [],
    maxChars: 4_000,
  });
  assert.ok(slice.includes('===== target.js ====='));
  assert.ok(slice.includes('[skeleton]'));
  assert.ok(slice.length <= 4_000);
  assert.equal(runFastFailSyntaxGate({ 'ok.js': 'function a() {\n return 1;\n}\n' }).ok, true);
  assert.equal(runFastFailSyntaxGate({ 'bad.js': 'function a() {\n return 1;\n' }).ok, false);
});

test('heal breaker halts on identical error signatures and process watchdog kills a real child', async () => {
  const breaker = new HealCycleBreaker();
  const stderr = 'SyntaxError: unexpected token at line 2';
  assert.equal(breaker.observe(stderr, ['a.js']).halt, false);
  assert.equal(breaker.observe(stderr, ['a.js']).halt, true);
  assert.notEqual(errorSignatureOf(stderr, ['a.js']), errorSignatureOf(stderr, ['b.js']));

  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const killed = await killProcessTree(child.pid || 0);
  assert.equal(killed.killed, true);
  if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  assert.notEqual(child.exitCode, null);
});

test('workspace cleaner removes only old owned temporary directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-sweep-'));
  try {
    const old = path.join(root, 'heal_old');
    const active = path.join(root, 'heal_active');
    const unrelated = path.join(root, 'keep_me');
    for (const dir of [old, active, unrelated]) fs.mkdirSync(dir, { recursive: true });
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(old, oldTime, oldTime);
    const result = sweepStaleWorkspaces([root], {
      maxAgeMs: 60 * 60 * 1000,
      active: new Set([active]),
    });
    assert.ok(result.removed.includes(old));
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(active), true);
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
