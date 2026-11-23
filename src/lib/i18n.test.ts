import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TRANSLATION_KEYS,
  isLanguage,
  t,
  TRANSLATIONS,
  type TranslationKey,
} from './i18n';

test('every key has a non-empty translation in both languages', () => {
  assert.ok(ALL_TRANSLATION_KEYS.length >= 30);
  for (const key of ALL_TRANSLATION_KEYS) {
    const entry = TRANSLATIONS[key];
    assert.ok(entry.ar.trim().length > 0, `${key} missing Arabic`);
    assert.ok(entry.en.trim().length > 0, `${key} missing English`);
  }
});

test('translations return the requested language and interpolate variables', () => {
  assert.equal(t('ar', 'nav.dashboard'), 'لوحة القياسات');
  assert.equal(t('en', 'nav.dashboard'), 'Dashboard');
  assert.equal(t('en', 'dash.reviewHint', { n: 3 }), 'Needs review: 3');
  assert.equal(t('ar', 'dash.reviewHint', { n: 3 }), 'يحتاج مراجعة: 3');
});

test('unknown keys fall back to the key itself, and language guard is strict', () => {
  assert.equal(t('en', 'missing.key' as TranslationKey), 'missing.key');
  assert.equal(isLanguage('ar'), true);
  assert.equal(isLanguage('en'), true);
  assert.equal(isLanguage('fr'), false);
  assert.equal(isLanguage(undefined), false);
});
