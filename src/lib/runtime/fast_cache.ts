/**
 * Content-addressable incremental cache + context pruning (v4).
 *
 * Keys are SHA-256(fileHashes + scope + analyzerVersion) so any byte change
 * invalidates immediately. Entries are persisted through the SQLite meta
 * namespace and evicted with a bounded LRU policy (256 entries).
 */

import crypto from 'node:crypto';

import { checkDelimiterBalance } from '../brains/surgical_patcher';

export interface MetaStore {
  getMetaValue(key: string): string | null;
  setMetaValue(key: string, value: string): void;
}

interface CacheEntry {
  key: string;
  scope: string;
  version: string;
  digest: string;
  value: unknown;
  computeMs: number;
  createdAt: number;
  lastUsed: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  savedMs: number;
  entries: number;
  bytes: number;
}

const CACHE_PREFIX = 'v4:cache:';
const STATS_KEY = 'v4:cache:stats';
const MAX_ENTRIES = 256;

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function contentDigest(files: Record<string, string>, scope: string, version: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${scope}\u0000${version}\u0000`);
  for (const file of Object.keys(files).sort()) {
    hash.update(`${file}\u0000${sha256(files[file])}\u0000`);
  }
  return hash.digest('hex');
}

export class IncrementalArtifactCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private savedMs = 0;

  constructor(private readonly store: MetaStore, private readonly maxEntries = MAX_ENTRIES) {
    this.load();
  }

  private load(): void {
    try {
      const raw = this.store.getMetaValue(CACHE_PREFIX + 'entries');
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry[];
        if (Array.isArray(parsed)) {
          for (const entry of parsed.slice(-this.maxEntries)) this.entries.set(entry.key, entry);
        }
      }
      const statsRaw = this.store.getMetaValue(STATS_KEY);
      if (statsRaw) {
        const stats = JSON.parse(statsRaw) as { hits?: number; misses?: number; savedMs?: number };
        this.hits = Number(stats.hits) || 0;
        this.misses = Number(stats.misses) || 0;
        this.savedMs = Number(stats.savedMs) || 0;
      }
    } catch {
      // corrupt cache state is discarded, never trusted
    }
  }

  private persist(): void {
    this.store.setMetaValue(CACHE_PREFIX + 'entries', JSON.stringify([...this.entries.values()]));
    this.store.setMetaValue(STATS_KEY, JSON.stringify({ hits: this.hits, misses: this.misses, savedMs: this.savedMs }));
  }

  getOrCompute<T>(
    scope: string,
    files: Record<string, string>,
    version: string,
    compute: () => T,
  ): { value: T; hit: boolean; durationMs: number } {
    const digest = contentDigest(files, scope, version);
    const key = `${scope}:${digest}`;
    const cached = this.entries.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      cached.hits += 1;
      this.hits += 1;
      this.savedMs += cached.computeMs;
      this.persist();
      return { value: cached.value as T, hit: true, durationMs: 0 };
    }

    const started = performance.now();
    const value = compute();
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    this.misses += 1;
    this.entries.set(key, {
      key,
      scope,
      version,
      digest,
      value,
      computeMs: durationMs,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      hits: 0,
    });
    this.evict();
    this.persist();
    return { value, hit: false, durationMs };
  }

  private evict(): void {
    if (this.entries.size <= this.maxEntries) return;
    const ordered = [...this.entries.values()].sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of ordered.slice(0, this.entries.size - this.maxEntries)) this.entries.delete(entry.key);
  }

  invalidate(scope?: string): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (!scope || entry.scope === scope) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    this.persist();
    return removed;
  }

  stats(): CacheStats {
    let bytes = 0;
    for (const entry of this.entries.values()) bytes += JSON.stringify(entry.value).length;
    return { hits: this.hits, misses: this.misses, savedMs: Math.round(this.savedMs), entries: this.entries.size, bytes };
  }
}

/** Compact skeleton line for an untouched file. */
function skeletonLine(line: string): string | null {
  const match =
    /^\s*(?:(?:export|default|public|private|protected|static|async|const|let|var|final|abstract)\s+)*.(?:function|class|interface|type|struct|enum|trait|def|module|subroutine|procedure|fn|func|method|constructor)\s+([A-Za-z_$][\w$]*)/.exec(line) ||
    /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?[\w<>\[\],.?]+\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
  return match ? `  ${match[1]}()` : null;
}

/** Full source for target + blast-radius files, signatures for everything else. */
export function pruneContextForLocalModel(input: {
  files: Record<string, string>;
  blastRadiusFiles?: string[];
  targetFile?: string;
  maxChars?: number;
}): string {
  const budget = Math.max(1_000, Math.min(24_000, input.maxChars ?? 12_000));
  const keep = new Set([input.targetFile, ...(input.blastRadiusFiles || [])].filter(Boolean) as string[]);
  const blocks: string[] = [];
  let used = 0;
  const ordered = Object.keys(input.files).sort();

  for (const file of ordered) {
    const content = input.files[file];
    const body = keep.has(file)
      ? content
      : content
          .split('\n')
          .map(skeletonLine)
          .filter((line): line is string => Boolean(line))
          .slice(0, 20)
          .join('\n');
    if (!body.trim()) continue;
    const block = `===== ${file}${keep.has(file) ? '' : ' [skeleton]'} =====\n${body.slice(0, 6_000)}`;
    if (used + block.length > budget && blocks.length > 0) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n').slice(0, budget);
}

export interface SyntaxGateResult {
  ok: boolean;
  failures: Array<{ file: string; message: string }>;
  filesChecked: number;
}

/** Fast, real syntax gate on changed files before a full test suite is launched. */
export function runFastFailSyntaxGate(files: Record<string, string>, changedFiles?: string[]): SyntaxGateResult {
  const targets = (changedFiles?.length ? changedFiles : Object.keys(files)).filter((file) => file in files).sort();
  const failures: SyntaxGateResult['failures'] = [];
  for (const file of targets) {
    const content = files[file];
    if (file.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (err) {
        failures.push({ file, message: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }
    const error = checkDelimiterBalance(file, content);
    if (error) failures.push({ file, message: error });
  }
  return { ok: failures.length === 0, failures, filesChecked: targets.length };
}
