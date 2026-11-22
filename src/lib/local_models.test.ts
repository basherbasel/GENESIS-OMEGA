import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_CODING_MODELS,
  findLocalModel,
  isLocalModelId,
  recommendLocalRouting,
  toModelOption,
} from './local_models';
import { AVAILABLE_MODELS, resolveAsymmetricRouting, setInstalledLocalModels } from './routing';
import { generateWithOllama, probeOllama, pullOllamaModel } from './ollama_client';
import { geminiModel, geminiTextModelIds, resolveGeminiTextModel } from './gemini_models';

test('local catalog is unique, bounded and internally consistent', () => {
  const ids = LOCAL_CODING_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate Ollama tags');
  assert.ok(LOCAL_CODING_MODELS.length >= 25, 'catalog should cover the lightweight ecosystem');
  for (const m of LOCAL_CODING_MODELS) {
    assert.ok(m.paramsB > 0 && m.paramsB <= 32);
    assert.ok(m.minRamGb > 0 && m.minRamGb <= 16);
    assert.ok(m.contextK > 0);
    assert.ok(m.quant.length >= 3);
    assert.ok(m.recommendedRoles.length > 0);
  }
  assert.equal(isLocalModelId('qwen2.5-coder:3b'), true);
  assert.equal(isLocalModelId('gemini-4-hydrogen'), false);
  assert.equal(isLocalModelId('x; rm -rf /'), false);
  assert.equal(findLocalModel('qwen2.5-coder:3b')?.tier, 'fast');
});

test('available models expose every local tag and keep Gemini indices stable', () => {
  assert.equal(AVAILABLE_MODELS[3].id, geminiModel('deep'));
  const ids = AVAILABLE_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of LOCAL_CODING_MODELS) assert.ok(ids.includes(m.id));
  const option = toModelOption(LOCAL_CODING_MODELS[0], true);
  assert.equal(option.group, 'local');
  assert.equal(option.installed, true);
});

test('routing validates local overrides and rejects injected model names', () => {
  const route = resolveAsymmetricRouting(
    { profile: 'performance', availableRamGb: 16 },
    { builder_alpha: 'qwen2.5-coder:3b', architect: 'nonexistent;curl evil' },
  );
  assert.equal(route.builder_alpha, 'qwen2.5-coder:3b');
  assert.equal(route.architect, geminiModel('flash'));
});

test('local-first routing prefers installed, RAM-fitting models', () => {
  setInstalledLocalModels(['qwen2.5-coder:1.5b', 'qwen2.5-coder:3b']);
  const eco = recommendLocalRouting({ profile: 'eco_ultra_light', availableRamGb: 3 }, new Set(['qwen2.5-coder:1.5b']));
  assert.ok(isLocalModelId(eco.builder_alpha));
  assert.ok(findLocalModel(eco.builder_alpha)!.minRamGb <= 3);
  assert.equal(eco.builder_alpha, 'qwen2.5-coder:1.5b');
  const perf = recommendLocalRouting({ profile: 'performance', availableRamGb: 16 }, new Set(['qwen2.5-coder:7b']));
  assert.equal(perf.builder_alpha, 'qwen2.5-coder:7b');
  setInstalledLocalModels([]);
});

test('Gemini model IDs are valid, env-overrideable and reject legacy placeholders', () => {
  for (const id of geminiTextModelIds()) {
    assert.match(id, /^gemini-[a-z0-9.\-]+$/);
  }
  assert.match(geminiModel('tts'), /^gemini-[\w.\-]+$/);
  assert.match(geminiModel('transcribe'), /^gemini-[\w.\-]+$/);
  assert.equal(resolveGeminiTextModel('gemini-4-hydrogen'), geminiModel('default'));
  process.env.OMEGA_MODEL_GEMINI_DEFAULT = 'gemini-2.5-flash';
  assert.equal(resolveGeminiTextModel('gemini-4-hydrogen'), 'gemini-2.5-flash');
  delete process.env.OMEGA_MODEL_GEMINI_DEFAULT;
});

test('Ollama client probes tags and parses generated JSON with mocked fetch', async () => {
  const original = globalThis.fetch;
  let pullBody = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'qwen2.5-coder:3b' }] }), { status: 200 });
    }
    if (url.endsWith('/api/version')) {
      return new Response(JSON.stringify({ version: '0.0.0-test' }), { status: 200 });
    }
    if (url.endsWith('/api/generate')) {
      const body = JSON.parse(String(init?.body || '{}')) as { format?: string; stream?: boolean };
      assert.equal(body.format, 'json');
      assert.equal(body.stream, false);
      return new Response(JSON.stringify({ response: '{"architectureSummary":"ok","files":[]}' }), { status: 200 });
    }
    if (url.endsWith('/api/pull')) {
      pullBody = String(init?.body || '');
      return new Response('{}', { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  try {
    const status = await probeOllama();
    assert.equal(status.online, true);
    assert.deepEqual(status.models, ['qwen2.5-coder:3b']);
    assert.equal(status.version, '0.0.0-test');

    const gen = await generateWithOllama({ model: 'qwen2.5-coder:3b', prompt: 'test', jsonMode: true });
    assert.equal(gen.ok, true);
    assert.deepEqual(JSON.parse(gen.text), { architectureSummary: 'ok', files: [] });

    process.env.OMEGA_ALLOW_MODEL_PULL = '1';
    assert.equal((await pullOllamaModel('qwen2.5-coder:3b')).ok, true);
    assert.deepEqual(JSON.parse(pullBody), { name: 'qwen2.5-coder:3b', stream: false });
    delete process.env.OMEGA_ALLOW_MODEL_PULL;
  } finally {
    globalThis.fetch = original;
  }
});
