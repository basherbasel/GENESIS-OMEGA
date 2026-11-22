import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxEnv, getLiveSandboxInfo, stopSandboxProcess } from './sandbox_runner';

test('buildSandboxEnv injects PORT and strips host secrets', () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousTest = process.env.OMEGA_TEST_SECRET;
  process.env.GEMINI_API_KEY = 'leak-me';
  process.env.OMEGA_TEST_SECRET = 'leak-me-too';
  try {
    const env = buildSandboxEnv(45123);
    assert.equal(env.PORT, '45123');
    assert.equal(env.GEMINI_API_KEY, undefined);
    assert.equal(env.OMEGA_TEST_SECRET, undefined);
    assert.ok(Object.keys(env).some((k) => k.toLowerCase() === 'path'), 'runtime PATH must survive');
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousTest === undefined) delete process.env.OMEGA_TEST_SECRET;
    else process.env.OMEGA_TEST_SECRET = previousTest;
  }
});

test('getLiveSandboxInfo returns null for a project with no running process', () => {
  assert.equal(getLiveSandboxInfo(999_991), null);
});

test('stopSandboxProcess is safe for an unknown project id', async () => {
  await assert.doesNotReject(stopSandboxProcess(999_992));
});
