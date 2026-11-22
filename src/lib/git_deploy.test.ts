import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sanitizeCommitMessage, sanitizeGitRemoteUrl } from './export';
import { buildDeployEnv, executeGitDeploy } from './git_deploy';

function newTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('deploy environment strips host secrets and Git path/config overrides', () => {
  process.env.GEMINI_API_KEY = 'test-secret-value';
  process.env.GIT_DIR = 'C:\\somewhere\\else';
  process.env.GIT_SSH_COMMAND = 'ssh -i /leaked/key';
  const env = buildDeployEnv();
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.GIT_DIR, undefined);
  assert.equal(env.GIT_SSH_COMMAND, undefined);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  delete process.env.GEMINI_API_KEY;
  delete process.env.GIT_DIR;
  delete process.env.GIT_SSH_COMMAND;
});

test('remote URL guard rejects embedded credentials, shell characters and system paths', () => {
  assert.equal(sanitizeGitRemoteUrl('https://ghp_secret@github.com/org/repo.git').valid, false);
  assert.equal(sanitizeGitRemoteUrl('https://github.com/org/repo.git; rm -rf /').valid, false);
  assert.equal(sanitizeGitRemoteUrl('https://github.com/org/repo.git').valid, true);
  assert.equal(sanitizeGitRemoteUrl('git@github.com:org/repo.git').valid, true);
  assert.equal(sanitizeGitRemoteUrl('C:\\Windows\\System32').valid, false);
  assert.equal(sanitizeGitRemoteUrl('C:\\Windows\\System32', { allowLocal: true }).valid, false);
  assert.equal(sanitizeGitRemoteUrl('C:\\repo.git', { allowLocal: true }).valid, true);
});

test('commit messages are stripped of shell and formatting metacharacters', () => {
  const clean = sanitizeCommitMessage('feat: `$(whoami)` "unsafe" \\ path\nsecond line');
  assert.ok(!/[`"$\\\r\n]/.test(clean));
  assert.equal(clean.includes('whoami'), true);
  assert.ok(clean.length <= 160);
  assert.equal(sanitizeCommitMessage('', 'demo').startsWith('chore: release demo'), true);
});

test('real Git deploy commits and pushes to a local bare repository', async () => {
  const root = newTempDir('omega-git-deploy-');
  const remotePath = path.join(root, 'remote.git');
  const workDir = path.join(root, 'bundle');
  try {
    git(['init', '--bare', remotePath]);
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'README.md'), '# real deploy test\n', 'utf-8');

    const result = await executeGitDeploy({
      repoDir: workDir,
      remoteUrl: remotePath.split(path.sep).join('/'),
      branch: 'main',
      commitMessage: 'chore: real deploy verification',
      allowLocalRemote: true,
    });

    assert.equal(result.success, true, result.error || 'deploy failed');
    assert.equal(result.pushed, true);
    assert.ok(result.commitHash && /^[0-9a-f]{7,40}$/.test(result.commitHash));
    assert.equal(
      git(['--git-dir', remotePath, 'rev-parse', 'main']),
      result.commitHash,
    );
    assert.match(git(['--git-dir', remotePath, 'show', 'main:README.md']), /real deploy test/);
    assert.ok(result.steps.filter((s) => !s.optional).every((s) => s.ok));
    assert.ok(result.steps.some((s) => s.optional && !s.ok), 'origin cleanup is an expected optional miss');
    assert.ok(result.commandPreview.some((c) => c.includes('git push -u origin main')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dry-run deploy creates a local commit but never pushes', async () => {
  const root = newTempDir('omega-git-dryrun-');
  const remotePath = path.join(root, 'remote.git');
  const workDir = path.join(root, 'bundle');
  try {
    git(['init', '--bare', remotePath]);
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'app.py'), 'print("ok")\n', 'utf-8');

    const result = await executeGitDeploy({
      repoDir: workDir,
      remoteUrl: remotePath.split(path.sep).join('/'),
      branch: 'main',
      commitMessage: 'chore: dry run',
      dryRun: true,
      allowLocalRemote: true,
    });

    assert.equal(result.success, true, result.error || 'dry run failed');
    assert.equal(result.dryRun, true);
    assert.equal(result.committed, true);
    assert.equal(result.pushed, false);
    assert.match(result.commandPreview.join('\n'), /git push -u origin main.*dry-run: not executed/);
    assert.equal(git(['rev-parse', 'HEAD'], workDir), result.commitHash);
    assert.throws(() => git(['--git-dir', remotePath, 'rev-parse', 'main']));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
