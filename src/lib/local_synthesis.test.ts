import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeWithBridge } from './local_synthesis';
import { LlamaBridgeError, type LlamaGenerationResult } from './llama-bridge';
import type { EcosystemMeta, ModelRoutingConfig, VaultEntry } from './types';

const eco = { displayName: 'Python 3.12', entryFile: 'main.py' } as EcosystemMeta;
const routing = { builder_alpha: 'qwen2.5-coder:3b' } as ModelRoutingConfig;
const vault: VaultEntry[] = [];

function params(generateFn: NonNullable<Parameters<typeof synthesizeWithBridge>[0]['generateFn']>) {
  return { title: 'Demo', prompt: 'Build an API', eco, routing, vault, generateFn };
}

test('local synthesis parses model JSON and rejects unsafe paths', async () => {
  const seen: string[] = [];
  const out = await synthesizeWithBridge(
    params(async (options) => {
      seen.push(options.model);
      return {
        model: options.model,
        durationMs: 12,
        text: JSON.stringify({
          architectureSummary: 'single module',
          files: [
            { path: 'main.py', content: 'print(1)' },
            { path: '../evil.py', content: 'bad' },
          ],
        }),
      } as LlamaGenerationResult;
    }),
  );
  assert.equal(out.engine, 'ollama-bridge');
  assert.equal(out.usedLocal, true);
  assert.equal(out.modelUsed, 'qwen2.5-coder:3b');
  assert.deepEqual(Object.keys(out.generatedFiles), ['main.py']);
  assert.equal(out.architectureSummary, 'single module');
  assert.deepEqual(seen, ['qwen2.5-coder:3b']);
});

test('bridge failures fail closed with their error code and no cloud fallback', async () => {
  const out = await synthesizeWithBridge(
    params(async () => {
      throw new LlamaBridgeError('MODEL_NOT_FOUND', 'model missing');
    }),
  );
  assert.equal(out.usedLocal, false);
  assert.deepEqual(out.generatedFiles, {});
  assert.equal(out.errorCode, 'MODEL_NOT_FOUND');
  assert.match(out.error || '', /model missing/);
});

test('invalid JSON from the model is reported, never partially applied', async () => {
  const out = await synthesizeWithBridge(
    params(async () => ({ model: 'm', durationMs: 1, text: '{not json' }) as LlamaGenerationResult),
  );
  assert.equal(out.usedLocal, false);
  assert.deepEqual(out.generatedFiles, {});
  assert.equal(out.errorCode, 'PROCESS_FAILED');
});
