/**
 * Optional offline speech-to-text (Whisper / faster-whisper / Vosk).
 *
 * No binary and no model means `STT_NOT_CONFIGURED`: the caller must fail
 * closed instead of sending audio to a cloud service. Child processes receive
 * a sanitized environment, argument vectors (never a shell) and a hard timeout.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { decodeAudioBase64, sanitizeChildEnv, sttExtensionForMime } from './voice_process';

const execFileAsync = promisify(execFile);

export interface OfflineSttConfig {
  engine: 'whisper' | 'vosk';
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** Reads STT configuration from an injectable env (defaults to process.env). */
export function resolveOfflineStt(env: NodeJS.ProcessEnv = process.env): OfflineSttConfig | null {
  const whisper = (env.OMEGA_WHISPER_BIN || '').trim();
  if (whisper) {
    return {
      engine: 'whisper',
      command: whisper,
      args: (env.OMEGA_WHISPER_ARGS || '--model,base,--output,stdout').split(',').map((a) => a.trim()).filter(Boolean),
      env: sanitizeChildEnv(env),
    };
  }
  const vosk = (env.OMEGA_VOSK_MODEL || '').trim();
  if (vosk) {
    return {
      engine: 'vosk',
      command: process.execPath,
      args: [path.join(process.cwd(), 'scripts', 'vosk_transcribe.mjs'), vosk],
      env: sanitizeChildEnv(env),
    };
  }
  return null;
}

export interface OfflineSttRequest {
  audioBase64: string;
  mimeType?: string;
  lang?: 'ar' | 'en';
}

export interface OfflineSttResult {
  transcript: string;
  engine: 'whisper' | 'vosk';
}

export class OfflineSttError extends Error {
  readonly code: 'STT_NOT_CONFIGURED' | 'STT_BAD_PAYLOAD' | 'STT_FAILED';

  constructor(code: 'STT_NOT_CONFIGURED' | 'STT_BAD_PAYLOAD' | 'STT_FAILED', message: string) {
    super(message);
    this.name = 'OfflineSttError';
    this.code = code;
  }
}

/** Strip whisper.cpp metadata lines; keep only the spoken text. */
export function cleanTranscript(raw: string): string {
  return (raw || '')
    .split('\n')
    .map((line) => line.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/, '').trim())
    .filter((line) => line && !/^\d+$/.test(line) && !line.startsWith('['))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export async function transcribeOfflineAudio(
  request: OfflineSttRequest,
  config: OfflineSttConfig | null,
): Promise<OfflineSttResult> {
  if (!config) throw new OfflineSttError('STT_NOT_CONFIGURED', 'no local offline STT binary or model configured');

  const extension = sttExtensionForMime(request.mimeType || 'audio/webm');
  if (!extension) throw new OfflineSttError('STT_BAD_PAYLOAD', 'unsupported audio mime type');
  const audio = decodeAudioBase64(request.audioBase64);
  if (!audio) throw new OfflineSttError('STT_BAD_PAYLOAD', 'audio payload is invalid or exceeds the byte cap');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-stt-'));
  const inputFile = path.join(tempDir, `audio${extension}`);
  try {
    fs.writeFileSync(inputFile, audio);
    const args = [...config.args, inputFile];
    const { stdout, stderr } = await execFileAsync(config.command, args, {
      cwd: tempDir,
      env: config.env,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const transcript = cleanTranscript(stdout || stderr || '');
    if (!transcript) throw new OfflineSttError('STT_FAILED', 'local STT returned no transcript');
    return { transcript, engine: config.engine };
  } catch (err) {
    if (err instanceof OfflineSttError) throw err;
    throw new OfflineSttError('STT_FAILED', err instanceof Error ? err.message : String(err));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
}
