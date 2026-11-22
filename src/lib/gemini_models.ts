/**
 * Single source of truth for Gemini model IDs used by the studio.
 *
 * Every ID can be overridden at runtime through an environment variable so a
 * deployment pinned to a specific model version never needs a code change.
 * Verified against the Gemini API model list (ai.google.dev/gemini-api/docs/models).
 */

export type GeminiModelKind =
  | 'default'
  | 'flash'
  | 'flashLite'
  | 'balanced'
  | 'deep'
  | 'tts'
  | 'transcribe';

const FALLBACKS: Record<GeminiModelKind, string> = {
  default: 'gemini-3.8-flash',
  flash: 'gemini-3.8-flash',
  flashLite: 'gemini-3.1-flash-lite',
  balanced: 'gemini-3.7-flash',
  deep: 'gemini-3.1-pro-preview',
  tts: 'gemini-3.8-flash-lite-tts',
  transcribe: 'gemini-3.5-transcribe',
};

const ENV_KEYS: Record<GeminiModelKind, string> = {
  default: 'OMEGA_MODEL_GEMINI_DEFAULT',
  flash: 'OMEGA_MODEL_GEMINI_FLASH',
  flashLite: 'OMEGA_MODEL_GEMINI_FLASH_LITE',
  balanced: 'OMEGA_MODEL_GEMINI_BALANCED',
  deep: 'OMEGA_MODEL_GEMINI_DEEP',
  tts: 'OMEGA_MODEL_GEMINI_TTS',
  transcribe: 'OMEGA_MODEL_GEMINI_TRANSCRIBE',
};

import { runtimeEnvValue } from './runtime_env';

/** Resolve one model kind, honoring its OMEGA_MODEL_* override. */
export function geminiModel(kind: GeminiModelKind): string {
  return runtimeEnvValue(ENV_KEYS[kind]).trim() || FALLBACKS[kind];
}

/** Text-capable model IDs exposed in the routing catalog. */
export function geminiTextModelIds(): string[] {
  return [geminiModel('flash'), geminiModel('flashLite'), geminiModel('balanced'), geminiModel('deep')];
}

/**
 * Accept any known text model, including an operator-supplied override; map
 * unknown/legacy IDs to the configured default instead of failing silently.
 */
export function resolveGeminiTextModel(requested: string | undefined): string {
  const fallback = geminiModel('default');
  if (!requested) return fallback;
  return geminiTextModelIds().includes(requested) || requested === fallback ? requested : fallback;
}
