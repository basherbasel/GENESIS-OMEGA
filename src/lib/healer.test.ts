import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildRepairCandidates,
  computeHealingScore,
  diagnoseFailures,
  healProject,
} from './healer';
import { verifyProjectWorkspace } from './verifier';
import type { ExecutionVerifySummary } from './types';

function fakeVerification(overrides: Partial<ExecutionVerifySummary> = {}): ExecutionVerifySummary {
  return {
    ranRealTests: true,
    runtime: 'python3',
    testsExecuted: 2,
    testsPassed: 0,
    redTeamPassed: true,
    exitCode: 1,
    outputSnippet: '',
    ...overrides,
  };
}

test('healer diagnoses real verifier output and static security findings', () => {
  const files = {
    'app.py': 'def broken()\n    return 1\n',
    'openapi.json': '{"a": 1,}',
    'red_team_attack.py': 'import os\nos.system("echo probe")\n',
  };
  const verification = fakeVerification({
    outputSnippet: [
      '[JSON ERR] openapi.json: trailing comma',
      '[py_compile FAILED] File "app.py", line 1\n    def broken()\nSyntaxError: expected \':\'',
      "ModuleNotFoundError: No module named 'missing_svc'",
      'AssertionError: 1 != 2',
    ].join('\n'),
  });
  const issues = diagnoseFailures(files, verification);
  const kinds = new Set(issues.map((i) => i.kind));
  assert.ok(kinds.has('json_syntax'));
  assert.ok(kinds.has('python_syntax'));
  assert.ok(kinds.has('python_missing_module'));
  assert.ok(kinds.has('test_failure'));
  assert.ok(kinds.has('redteam_violation'));
  const syntax = issues.find((i) => i.kind === 'python_syntax')!;
  assert.equal(syntax.file, 'app.py');
  assert.equal(syntax.line, 1);
});

test('healer generates parseable JSON, colon, secret and shell fixes', () => {
  const files = {
    'openapi.json': '{"a": 1,}',
    'app.py': "def run()\n    password = 'supersecret123'\n    return 1\n",
  };
  const issues = diagnoseFailures(
    files,
    fakeVerification({
      outputSnippet: [
        '[JSON ERR] openapi.json: trailing comma',
        "[py_compile FAILED] File \"app.py\", line 1\nSyntaxError: expected ':'",
      ].join('\n'),
    }),
  );
  const patches = buildRepairCandidates(files, issues);
  assert.ok(patches.length >= 3);

  const jsonPatch = patches.find((p) => p.id.startsWith('json-trailing-comma'))!;
  assert.deepEqual(JSON.parse(jsonPatch.files['openapi.json']), { a: 1 });

  const colonPatch = patches.find((p) => p.id.startsWith('py-syntax'))!;
  assert.equal(colonPatch.files['app.py'].split('\n')[0], 'def run():');

  const secretPatch = patches.find((p) => p.id.startsWith('secret:'))!;
  assert.match(secretPatch.files['app.py'], /password\s*=\s*os\.environ\.get\('PASSWORD'/);
  assert.match(secretPatch.files['app.py'], /^import os/m);
});

test('healing loop promotes only patches that improve the real measured score', async () => {
  const files = { 'app.py': 'def add(a, b)\n    return a + b\n' };
  const failing = fakeVerification({
    outputSnippet: "[py_compile FAILED] File \"app.py\", line 1\nSyntaxError: expected ':'",
    testsExecuted: 0,
    testsPassed: 0,
  });
  const passing = fakeVerification({
    exitCode: 0,
    testsExecuted: 2,
    testsPassed: 2,
    outputSnippet: '[py_compile OK] 1 Python modules compiled cleanly',
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-healer-'));
  try {
    const outcome = await healProject({
      projectId: 77,
      files,
      ecosystemKey: 'python',
      baselineVerification: failing,
      workspaceRoot: root,
      maxIterations: 3,
      verify: async (candidateFiles) => {
        if (candidateFiles['app.py'].split('\n')[0].endsWith(':')) return passing;
        return failing;
      },
    });
    assert.equal(outcome.report.status, 'improved');
    assert.equal(outcome.report.attempts.length, 1);
    assert.equal(outcome.report.finalScore, 97);
    assert.equal(outcome.files['app.py'].split('\n')[0], 'def add(a, b):');
    assert.equal(fs.readdirSync(root).length, 0, 'rejected candidate workspaces are cleaned up');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('healing loop never mutates files when no candidate improves the score', async () => {
  const files = { 'broken.py': 'def f(:\n  pass\n' };
  const failing = fakeVerification({
    outputSnippet: "[py_compile FAILED] File \"broken.py\", line 1\nSyntaxError: invalid syntax",
    testsExecuted: 0,
  });
  const outcome = await healProject({
    projectId: 78,
    files,
    ecosystemKey: 'python',
    baselineVerification: failing,
    workspaceRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'omega-healer-stable-')),
    maxIterations: 2,
    verify: async () => failing,
  });
  assert.equal(outcome.report.attempts.length, 0);
  assert.deepEqual(outcome.files, files);
  assert.equal(outcome.report.finalScore, outcome.report.initialScore);
});

test('healer repairs a genuinely broken Python project via the real OS verifier', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-healer-os-'));
  const workspace = path.join(root, 'verify');
  const broken: Record<string, string> = {
    'app.py': 'def add(a, b)\n    return a + b\n',
    'test_app.py': [
      'import unittest',
      'import app',
      '',
      'class TestAdd(unittest.TestCase):',
      '    def test_add(self):',
      '        self.assertEqual(app.add(2, 3), 5)',
      '',
      "if __name__ == '__main__':",
      '    unittest.main()',
      '',
    ].join('\n'),
  };

  try {
    const baseline = await verifyProjectWorkspace(workspace, broken, 'python');
    assert.equal(baseline.exitCode, 1, 'baseline must genuinely fail before healing');
    assert.match(baseline.outputSnippet, /SyntaxError: expected ':'/);

    const outcome = await healProject({
      projectId: 79,
      files: broken,
      ecosystemKey: 'python',
      baselineVerification: baseline,
      workspaceRoot: root,
      maxIterations: 3,
      verify: (candidateFiles, dir) => verifyProjectWorkspace(dir, candidateFiles, 'python'),
    });

    assert.ok(outcome.report.attempts.length >= 1);
    assert.equal(outcome.files['app.py'].split('\n')[0], 'def add(a, b):');
    assert.equal(outcome.report.finalVerification.exitCode, 0);
    assert.ok(outcome.report.finalVerification.testsPassed >= 1);
    assert.ok(
      computeHealingScore(outcome.files, outcome.report.finalVerification) >
        computeHealingScore(broken, baseline),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
