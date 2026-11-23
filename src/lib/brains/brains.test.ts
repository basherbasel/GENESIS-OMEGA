import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAIN_PROFILES,
  BRAIN_ROLES,
  buildBrainSystemPrompt,
  brainInferenceOptions,
  isBrainRole,
  resolveBrainModel,
} from './brain_registry';
import { formatIndexForPrompt, indexRepository } from './repo_indexer';
import { applySurgicalPatches } from './surgical_patcher';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('four deterministic local brain profiles resolve only installed catalog models', () => {
  assert.deepEqual(BRAIN_ROLES, ['architect', 'coder', 'healer', 'auditor']);
  assert.equal(isBrainRole('coder'), true);
  assert.equal(isBrainRole('gemini'), false);
  for (const role of BRAIN_ROLES) {
    const profile = BRAIN_PROFILES[role];
    assert.ok(profile.numCtx >= 4096 && profile.numCtx <= 8192);
    assert.ok(profile.temperature >= 0 && profile.temperature <= 0.5);
    assert.match(buildBrainSystemPrompt(role), /num_ctx=/);
    assert.deepEqual(brainInferenceOptions(role), {
      temperature: profile.temperature,
      numCtx: profile.numCtx,
      numPredict: profile.numPredict,
      repeatPenalty: profile.repeatPenalty,
    });
  }
  const installed = new Set(['qwen2.5-coder:1.5b']);
  assert.equal(resolveBrainModel('healer', installed), 'qwen2.5-coder:1.5b');
  assert.equal(resolveBrainModel('coder', installed), 'qwen2.5-coder:1.5b');
  const none = resolveBrainModel('architect', new Set(['gemini-4-hydrogen']));
  assert.match(none, /^qwen/);
});

test('repo indexer extracts real symbols across five languages with a bounded prompt', () => {
  const root = tempDir('omega-index-');
  const outside = tempDir('omega-index-outside-');
  try {
    fs.writeFileSync(path.join(root, 'app.ts'), [
      "import { readFile } from 'node:fs';",
      'export interface Config { name: string }',
      'export class Service { run(): void {} }',
      'export function buildConfig(): Config { return { name: "x" }; }',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'main.py'), [
      'import os',
      'class Worker:',
      '    def run(self):',
      '        return os.getcwd()',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'main.go'), [
      'package main',
      'import "fmt"',
      'type Store struct { n int }',
      'func NewStore() *Store { return &Store{} }',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'lib.rs'), [
      'use std::fmt;',
      'pub struct Point { x: i32 }',
      'pub fn make() -> Point { Point { x: 1 } }',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'util.cpp'), [
      '#include <string>',
      'class Buffer { public: int size(); };',
      'int compute(int n) { return n; }',
    ].join('\n'));
    fs.writeFileSync(path.join(outside, 'secret.ts'), 'function outsideOnly() { return 1; }');

    const index = indexRepository(root);
    const names = index.symbols.map((s) => s.name);
    for (const expected of ['Config', 'Service', 'buildConfig', 'Worker', 'run', 'Store', 'NewStore', 'Point', 'make', 'Buffer', 'compute']) {
      assert.ok(names.includes(expected), `missing symbol ${expected}`);
    }
    assert.ok(index.symbols.some((s) => s.kind === 'import' || index.files.some((f) => f.imports.includes('node:fs'))));
    assert.ok(!names.includes('outsideOnly'), 'index escaped the repository root');
    const functionSymbol = index.symbols.find((s) => s.name === 'buildConfig')!;
    assert.ok(functionSymbol.endLine >= functionSymbol.line);
    const compact = formatIndexForPrompt(index, 200);
    assert.ok(compact.length <= 200 + 60);
    assert.throws(() => indexRepository(path.join(root, 'app.ts')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('surgical patcher applies exact replacements and rolls back on any failure', () => {
  const files = {
    'src/app.ts': 'const value = 1;\nconst other = 2;\n',
    'config.json': '{"name":"old"}\n',
  };
  const ok = applySurgicalPatches(files, [
    { path: 'src/app.ts', search: 'const value = 1;', replace: 'const value = 42;' },
    { path: 'config.json', search: '"old"', replace: '"new"' },
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.changedFiles, ['config.json', 'src/app.ts']);
  assert.match(ok.files['src/app.ts'], /const value = 42;/);
  assert.match(ok.files['config.json'], /"new"/);
  assert.equal(files['src/app.ts'], 'const value = 1;\nconst other = 2;\n', 'source map was mutated');

  const ambiguous = applySurgicalPatches(files, [{ path: 'src/app.ts', search: 'const', replace: 'let' }]);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.failures[0].code, 'AMBIGUOUS_SEARCH');

  const occurrence = applySurgicalPatches(files, [{ path: 'src/app.ts', search: 'const', replace: 'let', occurrence: 2 }]);
  assert.equal(occurrence.ok, true);
  assert.match(occurrence.files['src/app.ts'], /let other = 2;/);

  const traversal = applySurgicalPatches(files, [{ path: '../../evil.ts', search: 'x', replace: 'y' }]);
  assert.equal(traversal.ok, false);
  assert.equal(traversal.failures[0].code, 'UNSAFE_PATH');

  const invalidJson = applySurgicalPatches(files, [
    { path: 'src/app.ts', search: 'const value = 1;', replace: 'const value = 42;' },
    { path: 'config.json', search: '}', replace: '' },
  ]);
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.failures[0].code, 'SYNTAX_INVALID');
  assert.deepEqual(invalidJson.files, files, 'whole batch must roll back');

  const missing = applySurgicalPatches(files, [{ path: 'src/app.ts', search: 'NOT_HERE', replace: 'x' }]);
  assert.equal(missing.failures[0].code, 'SEARCH_NOT_FOUND');
});

test('brain modules contain no cloud inference client', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of ['brain_registry.ts', 'repo_indexer.ts', 'surgical_patcher.ts']) {
    const source = fs.readFileSync(path.join(dir, name), 'utf-8');
    assert.doesNotMatch(source, /gemini|generateContent|https?:\/\/|fetch\(/i, `${name} must stay local`);
  }
});
