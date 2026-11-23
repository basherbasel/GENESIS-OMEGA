/**
 * Tamper-evident hash-chained audit ledger (v3 Part 2).
 *
 * Every entry binds to its predecessor:
 *   SHA256(prevHash | seq | timestamp | actor | action | target | outcomeHash)
 * The genesis predecessor is 64 zeroes. Any deletion, reordering or field edit
 * breaks the chain at a deterministically reportable position.
 */

import crypto from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);
const MAX_ENTRIES = 600;

export interface AuditEntry {
  seq: number;
  prevHash: string;
  hash: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  outcomeHash: string;
  detail?: string;
}

export interface AuditLedgerStore {
  load(): AuditEntry[];
  save(entries: AuditEntry[]): void;
}

export interface AuditInput {
  actor: string;
  action: string;
  target: string;
  outcome: unknown;
  detail?: string;
  timestamp?: string;
}

export interface LedgerVerification {
  valid: boolean;
  entries: number;
  firstSeq: number | null;
  lastSeq: number | null;
  brokenSequenceAt: number | null;
  brokenHashAt: number | null;
  duplicateSeq: number | null;
  detail: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Canonical, deterministic outcome digest (key order independent). */
export function outcomeHashOf(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
    }
    if (typeof item === 'number' && !Number.isFinite(item)) return String(item);
    return item;
  };
  return sha256(JSON.stringify(normalize(value) ?? null));
}

export function computeEntryHash(entry: Omit<AuditEntry, 'hash'>): string {
  return sha256(
    [
      entry.prevHash,
      String(entry.seq),
      entry.timestamp,
      entry.actor,
      entry.action,
      entry.target,
      entry.outcomeHash,
    ].join('|'),
  );
}

export function appendAuditEntry(store: AuditLedgerStore, input: AuditInput): AuditEntry {
  const previous = store.load();
  const last = previous.length > 0 ? previous[previous.length - 1] : null;
  const timestamp = input.timestamp || new Date().toISOString();
  const base = {
    seq: (last?.seq || 0) + 1,
    prevHash: last?.hash || GENESIS_HASH,
    timestamp,
    actor: input.actor,
    action: input.action,
    target: input.target,
    outcomeHash: outcomeHashOf(input.outcome),
    ...(input.detail ? { detail: input.detail.slice(0, 500) } : {}),
  };
  const entry: AuditEntry = { ...base, hash: computeEntryHash(base) };
  store.save([...previous, entry].slice(-MAX_ENTRIES));
  return entry;
}

/** Detects edits, deletions and reordering without trusting stored hashes. */
export function verifyLedgerIntegrity(entries: AuditEntry[]): LedgerVerification {
  if (entries.length === 0) {
    return {
      valid: true,
      entries: 0,
      firstSeq: null,
      lastSeq: null,
      brokenSequenceAt: null,
      brokenHashAt: null,
      duplicateSeq: null,
      detail: 'empty ledger',
    };
  }
  let brokenSequenceAt: number | null = null;
  let brokenHashAt: number | null = null;
  let duplicateSeq: number | null = null;
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  const seen = new Set<number>();

  for (const entry of entries) {
    if (seen.has(entry.seq) && duplicateSeq === null) duplicateSeq = entry.seq;
    seen.add(entry.seq);
    if (entry.seq !== expectedSeq && brokenSequenceAt === null) brokenSequenceAt = entry.seq;
    if (entry.prevHash !== expectedPrev && brokenHashAt === null) brokenHashAt = entry.seq;
    const { hash, ...base } = entry;
    if (computeEntryHash(base) !== hash && brokenHashAt === null) brokenHashAt = entry.seq;
    expectedPrev = hash;
    expectedSeq = entry.seq + 1;
  }

  const valid = brokenSequenceAt === null && brokenHashAt === null && duplicateSeq === null;
  return {
    valid,
    entries: entries.length,
    firstSeq: entries[0].seq,
    lastSeq: entries[entries.length - 1].seq,
    brokenSequenceAt,
    brokenHashAt,
    duplicateSeq,
    detail: valid ? 'hash chain intact' : `chain broken (seq=${brokenSequenceAt ?? '-'}, hash=${brokenHashAt ?? '-'})`,
  };
}
