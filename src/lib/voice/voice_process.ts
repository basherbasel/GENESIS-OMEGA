/**
 * Shared child-process hygiene for local voice binaries (Piper, Whisper, Vosk).
 *
 * Secret-shaped variables are removed before spawning anything that consumes
 * user text or audio; PATH and OS variables are preserved so the binary can be
 * discovered. Zero cloud calls, zero shell interpretation.
 */

const SECRET_KEY_PATTERN = /(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;

export function sanitizeChildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || SECRET_KEY_PATTERN.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

/** Maximum accepted audio payload for local offline STT (8 MiB, fail closed). */
export const MAX_STT_AUDIO_BYTES = 8 * 1024 * 1024;

export function decodeAudioBase64(raw: string): Buffer | null {
  const cleaned = (raw || '').includes(',') ? (raw.split(',').pop() || '') : raw;
  if (!cleaned || cleaned.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  try {
    const buffer = Buffer.from(cleaned, 'base64');
    return buffer.length > 0 && buffer.length <= MAX_STT_AUDIO_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

/** Strict extension allow-list; prevents interpreting an upload as a script. */
export function sttExtensionForMime(mimeType: string): string | null {
  const normalized = (mimeType || '').toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/flac': '.flac',
  };
  return map[normalized] || null;
}
