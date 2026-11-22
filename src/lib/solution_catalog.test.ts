import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ECOSYSTEM_CATALOG } from './ecosystems';
import { isSafeRelativePath } from './security';
import {
  SOLUTION_DOMAINS,
  detectSolutionDomain,
  generateFromPrompt,
  generateSolutionFiles,
  getSolutionDomain,
  listSolutionDomains,
} from './solution_catalog';
import { verifyProjectWorkspace } from './verifier';

function hasTool(cmd: string): boolean {
  try {
    return spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

test('catalog covers every ecosystem with unique domain ids', () => {
  const ids = SOLUTION_DOMAINS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SOLUTION_DOMAINS.length >= 18);
  const covered = new Set(SOLUTION_DOMAINS.map((d) => d.ecosystem));
  for (const key of Object.keys(ECOSYSTEM_CATALOG)) {
    assert.ok(covered.has(key as keyof typeof ECOSYSTEM_CATALOG), `missing domain for ${key}`);
  }
  const listed = listSolutionDomains();
  assert.equal(listed.length, ids.length);
  assert.ok(listed.every((d) => d.labelAr && d.testCommand && d.entryFile && d.tags.length > 0));
});

test('every generated bundle is deterministic, safe and self-contained', () => {
  for (const domain of SOLUTION_DOMAINS) {
    const first = generateSolutionFiles(domain.id, 'مثال هندسي', 'وصف اعتباطي للأداة');
    const second = generateSolutionFiles(domain.id, 'مثال هندسي', 'وصف اعتباطي للأداة');
    assert.deepEqual(first, second, `${domain.id} must be deterministic`);
    assert.ok(Object.keys(first).length >= 6, `${domain.id} must include docs, tests and CI`);
    assert.ok(first['README.md'] && first['solution.json'] && first['.github/workflows/ci.yml']);
    let bytes = 0;
    for (const [name, content] of Object.entries(first)) {
      assert.ok(isSafeRelativePath(name), `${domain.id} emitted unsafe path ${name}`);
      assert.ok(!name.split('/').includes('..'));
      assert.ok(content.length > 0, `${domain.id} emitted empty file ${name}`);
      bytes += Buffer.byteLength(content, 'utf8');
    }
    assert.ok(bytes > 200 && bytes < 2_000_000, `${domain.id} bundle size ${bytes}`);
  }
});

test('domain detection honours explicit tags, ids and rejects unknown ones', () => {
  assert.equal(detectSolutionDomain('anything', 'security-scanner')?.id, 'security-scanner');
  assert.equal(detectSolutionDomain('[Solution Domain: data-pipeline] arbitrary')?.id, 'data-pipeline');
  assert.equal(detectSolutionDomain('بناء خادم REST API لإدارة العملاء')?.id, 'rest-api');
  assert.equal(detectSolutionDomain('أداة Rust آمنة الذاكرة')?.id, 'systems-cli');
  assert.equal(detectSolutionDomain('تطبيق flutter للموبايل')?.id, 'mobile-app');
  assert.equal(detectSolutionDomain('جملة بلا إشارات'), null);
  assert.equal(getSolutionDomain('does-not-exist'), null);
  assert.throws(() => generateSolutionFiles('does-not-exist', 'x', 'y'), /unknown solution domain/);
  assert.throws(
    () => generateSolutionFiles('rest-api', 'x', 'y', { ecosystem: 'go' }),
    /requires python/,
  );
});

test('generateFromPrompt couples detection with generation', () => {
  const result = generateFromPrompt('ماسح أمان للكشف عن المفاتيح', 'أداة التدقيق');
  assert.equal(result?.domain.id, 'security-scanner');
  assert.ok(result?.files['scanner.py']);
  assert.equal(generateFromPrompt('لا شيء محدد', 'x'), null);
});

test('generated Python and Node solutions pass their real test suites', async () => {
  const runnable = [
    'rest-api', 'cli-tool', 'data-pipeline', 'ml-inference',
    'security-scanner', 'database-schema', 'static-site', 'realtime-hub', 'typed-service',
  ];
  for (const id of runnable) {
    const domain = getSolutionDomain(id)!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `omega-sol-${id}-`));
    try {
      const files = generateSolutionFiles(id, `Probe ${id}`, 'probe');
      const summary = await verifyProjectWorkspace(dir, files, domain.ecosystem);
      assert.equal(summary.exitCode, 0, `${id}: ${summary.outputSnippet.slice(-300)}`);
      assert.ok(summary.testsExecuted > 0, `${id} executed no tests`);
      assert.equal(summary.testsPassed, summary.testsExecuted, `${id} had failing tests`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('generated toolchain solutions run when their compilers are installed', async () => {
  const cases: Array<[string, string]> = [
    ['jvm-service', 'javac'],
    ['windows-admin', 'pwsh'],
    ['systems-cli', 'cargo'],
    ['ruby-automation', 'ruby'],
    ['game-logic', 'lua'],
    ['php-backend', 'php'],
    ['native-tool', 'gcc'],
    ['cpp-engine', 'g++'],
    ['scientific-compute', 'gfortran'],
    ['classic-tool', 'fpc'],
    ['legacy-bridge', 'cobc'],
    ['mobile-app', 'dart'],
    ['dotnet-service', 'dotnet'],
  ];
  for (const [id, tool] of cases) {
    if (!hasTool(tool)) continue;
    const domain = getSolutionDomain(id)!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `omega-sol-${id}-`));
    try {
      const summary = await verifyProjectWorkspace(dir, generateSolutionFiles(id, 'Probe', 'probe'), domain.ecosystem);
      assert.equal(summary.exitCode, 0, `${id}: ${summary.outputSnippet.slice(-300)}`);
      assert.equal(summary.ranRealTests, true);
      assert.equal(summary.testsPassed, summary.testsExecuted);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
