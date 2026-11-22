import test from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_MODELS, resolveAsymmetricRouting, isLocalModelId } from './routing';
import { geminiModel } from './gemini_models';

test('routing uses the governor tier for every agent role', () => {
  const performance = resolveAsymmetricRouting({ profile: 'performance', availableRamGb: 16 });
  assert.equal(performance.architect, geminiModel('flash'));
  assert.equal(performance.red_team, geminiModel('deep'));

  const eco = resolveAsymmetricRouting({ profile: 'eco_ultra_light' });
  assert.equal(eco.architect, geminiModel('flashLite'));
  assert.equal(eco.builder_alpha, 'qwen2.5-coder:3b');
});

test('overrides accept catalog ids and reject injected strings', () => {
  const route = resolveAsymmetricRouting(
    { profile: 'performance', availableRamGb: 16 },
    { builder_alpha: 'qwen2.5-coder:1.5b', strategist: 'evil-model; rm -rf /' },
  );
  assert.equal(route.builder_alpha, 'qwen2.5-coder:1.5b');
  assert.equal(route.strategist, geminiModel('flash'));
});

test('catalog exposes local quantized models alongside cloud entries', () => {
  assert.ok(AVAILABLE_MODELS.some((m) => m.id === 'qwen2.5-coder:1.5b'));
  assert.ok(AVAILABLE_MODELS.some((m) => m.id === 'qwen2.5-coder:7b'));
  assert.equal(isLocalModelId('qwen2.5-coder:1.5b'), true);
  assert.equal(isLocalModelId(geminiModel('flash')), false);
});
