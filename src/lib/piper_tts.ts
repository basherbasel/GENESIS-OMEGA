import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { NeuralTtsStatus, ProsodyConfig } from './types';
import { sanitizeChildEnv } from './voice/voice_process';

export type { NeuralTtsStatus } from './types';

export interface PiperCommandRequest {
  command: string;
  args: string[];
  input: string;
  timeoutMs: number;
  /** Sanitized child environment; secret-shaped keys are removed by the engine. */
  env?: NodeJS.ProcessEnv;
}

export interface PiperCommandResult {
  code: number | null;
  stderr?: string;
}

export type PiperCommandRunner = (request: PiperCommandRequest) => Promise<PiperCommandResult>;

export interface PiperNeuralVoiceEngineOptions {
  cacheDir?: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  runner?: PiperCommandRunner;
  timeoutMs?: number;
  maxCacheFiles?: number;
  modelDirs?: string[];
}

const WAV_MIN_BYTES = 44;
const WAV_MAX_BYTES = 16 * 1024 * 1024;
const MAX_SPEECH_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_CACHE_FILES = 300;
const DISCOVERY_TTL_MS = 5_000;

const ARABIC_MODEL_HINTS = ['arabic', 'kareem', 'salma', 'shakir'];
const ENGLISH_MODEL_HINTS = ['english', 'amy', 'ryan', 'lessac', 'libritts', 'ljspeech'];
const SKIP_DIR_NAMES = new Set([
  '.git',
  '.aistudio',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'voice_cache',
  'workspaces',
]);

type ArgStyle = 'modern' | 'legacy';

interface SynthesisAttempt {
  flag: string;
  withConfig: boolean;
  style: ArgStyle;
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isExecutableFile(candidate: string): boolean {
  if (!isFile(candidate)) return false;
  if (process.platform === 'win32') return true;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isUsableWav(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= WAV_MIN_BYTES || stat.size > WAV_MAX_BYTES) return false;
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      return header.toString('ascii') === 'RIFF';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function looksLikeLanguageModel(fileName: string, lang: 'ar' | 'en'): boolean {
  const low = fileName.toLowerCase();
  if (lang === 'ar') {
    if (ARABIC_MODEL_HINTS.some((hint) => low.includes(hint))) return true;
    return /(?:^|[._-])ar(?:[._-]|$)/i.test(fileName) || /(?:^|[._-])ara(?:[._-]|$)/i.test(fileName);
  }
  if (ENGLISH_MODEL_HINTS.some((hint) => low.includes(hint))) return true;
  return /(?:^|[._-])en(?:[._-]|$)/i.test(fileName) || /(?:^|[._-])eng(?:[._-]|$)/i.test(fileName);
}

function dedupePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const resolved = path.resolve(value);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

function resolveInPath(env: NodeJS.ProcessEnv, names: string[]): string | null {
  const pathValue = env.PATH || env.Path || env.path || '';
  if (!pathValue) return null;
  for (const rawDir of pathValue.split(path.delimiter)) {
    const dir = rawDir.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) return path.resolve(candidate);
    }
  }
  return null;
}

/**
 * Local, offline neural TTS bridge around the Piper executable.
 *
 * - Discovers `piper` / `piper.exe` from `OMEGA_PIPER_BIN`, PATH, or local folders.
 * - Discovers an Arabic `.onnx` voice from `OMEGA_PIPER_MODEL` or common model folders.
 * - Caches generated WAV files by SHA-256(model | length_scale | text) to avoid re-synthesis.
 * - Translates `prosody.rate` into Piper's `length_scale` (lower = faster).
 */
export class PiperNeuralVoiceEngine {
  readonly cacheDir: string;
  readonly baseDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: PiperCommandRunner;
  private readonly timeoutMs: number;
  private readonly maxCacheFiles: number;
  private readonly extraModelDirs: string[];
  private readonly inflight = new Map<string, Promise<string | null>>();

  private piperBin = '';
  private modelPath = '';
  private modelPathEn = '';
  private lastDiscoveryAt = 0;
  private lastError = '';
  private argStyle: ArgStyle | null = null;

  constructor(options: PiperNeuralVoiceEngineOptions = {}) {
    this.baseDir = path.resolve(options.baseDir || process.cwd());
    this.cacheDir = path.resolve(options.cacheDir || path.join(this.baseDir, 'genesis_studio_data', 'voice_cache'));
    this.env = options.env || process.env;
    this.runner = options.runner || runPiperCommand;
    this.timeoutMs = Math.max(2_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxCacheFiles = Math.max(10, options.maxCacheFiles ?? DEFAULT_MAX_CACHE_FILES);
    this.extraModelDirs = (options.modelDirs || []).map((dir) => path.resolve(dir));

    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.refreshDiscovery(true);
  }

  private refreshDiscovery(force = false): void {
    const now = Date.now();
    if (!force && this.lastDiscoveryAt > 0 && now - this.lastDiscoveryAt < DISCOVERY_TTL_MS) return;
    this.piperBin = this.discoverPiperBinary();
    const models = this.discoverModels();
    this.modelPath = models.ar;
    this.modelPathEn = models.en;
    this.lastDiscoveryAt = now;
  }

  private discoverPiperBinary(): string {
    const envBin = (this.env.OMEGA_PIPER_BIN || '').trim();
    if (envBin && isExecutableFile(envBin)) return path.resolve(envBin);

    const names =
      process.platform === 'win32'
        ? ['piper.exe', 'piper.cmd', 'piper.bat', 'piper']
        : ['piper'];
    const fromPath = resolveInPath(this.env, names);
    if (fromPath) return fromPath;

    const localCandidates = [
      path.join(this.baseDir, 'piper', 'piper.exe'),
      path.join(this.baseDir, 'piper', 'piper'),
      path.join(this.baseDir, 'tools', 'piper', 'piper.exe'),
      path.join(this.baseDir, 'tools', 'piper', 'piper'),
      path.join(this.baseDir, 'bin', 'piper.exe'),
      path.join(this.baseDir, 'bin', 'piper'),
      path.join(process.cwd(), 'piper', 'piper.exe'),
      path.join(process.cwd(), 'piper', 'piper'),
      path.join('E:/piper', 'piper.exe'),
      path.join('E:/piper', 'piper.cmd'),
      path.join('E:/piper', 'piper.bat'),
      path.join('E:/piper', 'piper'),
    ];
    for (const candidate of dedupePaths(localCandidates)) {
      if (isExecutableFile(candidate)) return candidate;
    }
    return '';
  }

  private searchRoots(): string[] {
    return dedupePaths([
      this.baseDir,
      path.join(this.baseDir, 'models', 'piper'),
      path.join(this.baseDir, 'piper_models'),
      path.join(this.baseDir, 'voices'),
      path.join(os.homedir(), '.local', 'share', 'piper'),
      'E:/piper',
      ...this.extraModelDirs,
    ]);
  }

  private collectOnnxFiles(root: string, depth: number, acc: string[]): void {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name.toLowerCase())) continue;
        this.collectOnnxFiles(fullPath, depth + 1, acc);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.onnx')) {
        acc.push(path.resolve(fullPath));
      }
    }
  }

  private discoverModels(): { ar: string; en: string } {
    const configuredAr = (this.env.OMEGA_PIPER_MODEL_AR || this.env.OMEGA_PIPER_MODEL || '').trim();
    const configuredEn = (this.env.OMEGA_PIPER_MODEL_EN || '').trim();
    const arOverride = configuredAr && isFile(configuredAr) ? path.resolve(configuredAr) : '';
    const enOverride = configuredEn && isFile(configuredEn) ? path.resolve(configuredEn) : '';

    const onnxFiles: string[] = [];
    for (const root of this.searchRoots()) {
      try {
        const stat = fs.statSync(root);
        if (stat.isFile() && root.toLowerCase().endsWith('.onnx')) {
          onnxFiles.push(path.resolve(root));
        } else if (stat.isDirectory()) {
          this.collectOnnxFiles(root, 0, onnxFiles);
        }
      } catch {
        // missing search root is expected on most machines
      }
    }

    const uniqueFiles = Array.from(new Set(onnxFiles));
    const ar = arOverride || uniqueFiles.find((file) => looksLikeLanguageModel(path.basename(file), 'ar')) || uniqueFiles[0] || '';
    const en =
      enOverride ||
      uniqueFiles.find((file) => file !== ar && looksLikeLanguageModel(path.basename(file), 'en')) ||
      uniqueFiles.find((file) => file !== ar) ||
      ar;
    return { ar, en };
  }

  /** Match the requested language, with a deterministic fallback to the other voice. */
  private modelFor(lang: 'ar' | 'en'): string {
    if (lang === 'en') return this.modelPathEn || this.modelPath;
    return this.modelPath || this.modelPathEn;
  }

  status(): NeuralTtsStatus {
    this.refreshDiscovery(false);
    const ready = Boolean(this.piperBin && (this.modelPath || this.modelPathEn));
    return {
      piper_binary_found: Boolean(this.piperBin),
      piper_binary: this.piperBin,
      arabic_model_found: Boolean(this.modelPath),
      english_model_found: Boolean(this.modelPathEn),
      model_path: this.modelPath || this.modelPathEn,
      model_path_en: this.modelPathEn,
      bilingual_ready: Boolean(this.piperBin && this.modelPath && this.modelPathEn),
      offline_neural_ready: ready,
      cache_dir: this.cacheDir,
      ...(this.lastError ? { last_error: this.lastError } : {}),
    };
  }

  static cleanForSpeech(text: string): string {
    const cleaned = (text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[`*_#~>[\]|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  }

  static rateToLengthScale(rate: number): number {
    // In Piper a lower length_scale means faster speech; higher means slower.
    const safeRate = Math.max(0.75, Math.min(1.35, Number(rate) || 1.02));
    const scale = 1 / safeRate;
    return Math.round(Math.max(0.72, Math.min(1.3, scale)) * 100) / 100;
  }

  async synthesizeWav(
    text: string,
    prosody?: Partial<ProsodyConfig> | null,
    lang: 'ar' | 'en' = 'ar',
  ): Promise<string | null> {
    const spoken = PiperNeuralVoiceEngine.cleanForSpeech(text).slice(0, MAX_SPEECH_CHARS);
    if (!spoken) return null;

    if (!this.piperBin || (!this.modelPath && !this.modelPathEn)) {
      this.refreshDiscovery(true);
    }
    const modelPath = this.modelFor(lang);
    if (!this.piperBin || !modelPath) return null;

    const lengthScale = PiperNeuralVoiceEngine.rateToLengthScale(prosody?.rate ?? 1.02);
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${lang}|${modelPath}|${lengthScale}|${spoken}`, 'utf8')
      .digest('hex')
      .slice(0, 20);
    const outWav = path.join(this.cacheDir, `piper_${cacheKey}.wav`);

    if (isUsableWav(outWav)) return outWav;

    const running = this.inflight.get(outWav);
    if (running) return running;

    const task = this.generateWav(spoken, lengthScale, outWav, modelPath)
      .catch((err) => {
        this.lastError = err instanceof Error ? err.message : String(err);
        return null;
      })
      .finally(() => {
        this.inflight.delete(outWav);
      });
    this.inflight.set(outWav, task);
    return task;
  }

  private attemptsForModel(modelPath: string): SynthesisAttempt[] {
    const hasConfig = isFile(`${modelPath}.json`);
    const modern: SynthesisAttempt = {
      flag: '--length-scale',
      withConfig: false,
      style: 'modern',
    };
    const legacy: SynthesisAttempt = {
      flag: '--length_scale',
      withConfig: false,
      style: 'legacy',
    };

    if (this.argStyle === 'legacy') return [legacy];

    const attempts: SynthesisAttempt[] = [];
    if (hasConfig) attempts.push({ ...modern, withConfig: true });
    attempts.push(modern);
    if (this.argStyle === null) attempts.push(legacy);
    return attempts;
  }

  private async generateWav(
    spoken: string,
    lengthScale: number,
    outWav: string,
    modelPath: string,
  ): Promise<string | null> {
    const tempWav = path.join(
      this.cacheDir,
      `.${path.basename(outWav, '.wav')}.${process.pid}.${Date.now()}.tmp.wav`,
    );

    let lastFailure = '';
    for (const attempt of this.attemptsForModel(modelPath)) {
      const args = [
        '--model',
        modelPath,
        attempt.flag,
        String(lengthScale),
        '--output_file',
        tempWav,
      ];
      if (attempt.withConfig) {
        args.push('--config', `${modelPath}.json`);
      }

      try {
        const result = await this.runner({
          command: this.piperBin,
          args,
          input: spoken,
          timeoutMs: this.timeoutMs,
          env: sanitizeChildEnv(this.env),
        });
        if (result.code === 0 && isUsableWav(tempWav)) {
          this.argStyle = attempt.style;
          this.lastError = '';
          try {
            this.commitCacheFile(tempWav, outWav);
            this.pruneCache();
            return outWav;
          } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            return null;
          }
        }
        lastFailure = (result.stderr || '').trim() || `piper exited with code ${String(result.code)}`;
      } catch (err) {
        lastFailure = err instanceof Error ? err.message : String(err);
      } finally {
        try {
          fs.unlinkSync(tempWav);
        } catch {
          // no partial file
        }
      }
    }

    this.lastError = lastFailure.slice(-500);
    return null;
  }

  private commitCacheFile(tempWav: string, outWav: string): void {
    try {
      if (fs.existsSync(outWav)) fs.unlinkSync(outWav);
      fs.renameSync(tempWav, outWav);
    } catch {
      fs.copyFileSync(tempWav, outWav);
    }
  }

  private pruneCache(): void {
    try {
      const entries = fs
        .readdirSync(this.cacheDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^piper_[a-f0-9]+\.wav$/i.test(entry.name))
        .map((entry) => {
          const fullPath = path.join(this.cacheDir, entry.name);
          return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => a.mtimeMs - b.mtimeMs);
      const overflow = entries.length - this.maxCacheFiles;
      for (let i = 0; i < overflow; i++) {
        try {
          fs.unlinkSync(entries[i].fullPath);
        } catch {
          // best-effort cache trimming
        }
      }
    } catch {
      // cache pruning must never break synthesis
    }
  }
}

export function runPiperCommand(request: PiperCommandRequest): Promise<PiperCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stderr: stderr.slice(-4_000) });
    };

    // Windows .cmd/.bat shims must be launched through cmd.exe; native .exe files
    // are spawned directly so user text and model paths are never shell-interpreted.
    const isWindowsShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(request.command);
    const command = isWindowsShim ? process.env.ComSpec || 'cmd.exe' : request.command;
    const quoteForCmd = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const args = isWindowsShim
      ? [
          '/d',
          '/s',
          '/c',
          `"${[request.command, ...request.args].map(quoteForCmd).join(' ')}"`,
        ]
      : request.args;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        windowsVerbatimArguments: isWindowsShim,
        stdio: ['pipe', 'ignore', 'pipe'],
        env: request.env || sanitizeChildEnv(process.env),
      });
    } catch (err) {
      resolve({ code: -1, stderr: err instanceof Error ? err.message : String(err) });
      return;
    }

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // process already exited
      }
      finish(-1);
    }, request.timeoutMs);

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.on('error', (err) => {
      stderr += err.message;
      finish(-1);
    });
    child.on('close', (code) => finish(code));
    child.stdin?.on('error', () => {
      // piper may close stdin early on argument errors
    });
    try {
      child.stdin?.write(request.input, 'utf8');
      child.stdin?.end();
    } catch (err) {
      stderr += err instanceof Error ? err.message : String(err);
      try {
        child.kill();
      } catch {
        // ignored
      }
    }
  });
}

/**
 * Safely resolves a requested WAV name inside the voice cache.
 * Returns null for traversal attempts, nested paths, or non-WAV names.
 */
export function resolveVoiceCacheFile(cacheDir: string, filename: string): string | null {
  if (!/^[a-zA-Z0-9_.-]+\.wav$/.test(filename)) return null;
  const safeName = path.basename(filename);
  if (safeName !== filename) return null;

  const root = path.resolve(cacheDir);
  const fullPath = path.resolve(root, safeName);
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

/** Builds the public API URL for a synthesized WAV, or null when synthesis failed. */
export function toVoiceAudioUrl(wavPath: string | null | undefined): string | null {
  if (!wavPath) return null;
  return `/api/voice/audio/${encodeURIComponent(path.basename(wavPath))}`;
}
