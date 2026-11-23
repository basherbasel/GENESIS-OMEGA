/**
 * SQLite WAL repository for the studio state.
 *
 * Replaces direct reads/writes of omega_store.json while preserving that file
 * as a human-readable mirror. `backup.ts`/`restore.ts` therefore keep working:
 * on startup a restored or edited JSON file whose hash differs from the stored
 * mirror hash is imported back into SQLite.
 *
 * Complexity: load/save are O(n) over stored rows (small single-user state);
 * writes are a single transaction, so there is no partial state on disk.
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseStoreData } from './store_schema';
import type { StoreData } from './types';

const MIRROR_HASH_KEY = 'mirror_hash';

export interface ImportResult {
  imported: boolean;
  reason: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export class StoreRepository {
  private readonly db: DatabaseSync;

  constructor(
    private readonly dbPath: string,
    private readonly mirrorPath: string,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA synchronous=NORMAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vault_entries (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cognitive (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
    `);
  }

  /** Public meta access for auxiliary persisted records (e.g. work orders). */
  getMetaValue(key: string): string | null {
    return this.getMeta(key);
  }

  setMetaValue(key: string, value: string): void {
    this.setMeta(key, value);
  }

  /** Actual journal mode reported by SQLite — used by tests and doctor. */
  journalMode(): string {
    return String((this.db.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string })?.journal_mode || '');
  }

  hasData(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM projects;').get() as { n: number };
    return row.n > 0 || fs.existsSync(this.mirrorPath);
  }

  private getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?;').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;').run(key, value);
  }

  /**
   * Import the JSON mirror when the database has no rows or when the mirror's
   * hash differs (e.g. after a restore). Never overwrites the mirror.
   */
  importLegacyIfNeeded(): ImportResult {
    if (!fs.existsSync(this.mirrorPath)) {
      return { imported: false, reason: 'no JSON mirror present' };
    }
    const raw = fs.readFileSync(this.mirrorPath, 'utf-8');
    const currentHash = sha256(raw);
    if (this.getMeta(MIRROR_HASH_KEY) === currentHash && this.hasRows()) {
      return { imported: false, reason: 'mirror already applied' };
    }
    const data = parseStoreData<StoreData>(JSON.parse(raw));
    this.writeTransaction(data);
    this.setMeta(MIRROR_HASH_KEY, currentHash);
    return { imported: true, reason: 'JSON mirror imported into SQLite' };
  }

  private hasRows(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM projects;').get() as { n: number };
    return row.n > 0;
  }

  load(): StoreData {
    const meta = (key: string, fallback: number): number => {
      const value = this.getMeta(key);
      const parsed = value === null ? NaN : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const projects = (this.db.prepare('SELECT payload FROM projects ORDER BY id;').all() as Array<{ payload: string }>)
      .map((r) => JSON.parse(r.payload) as StoreData['projects'][number]);
    const vault = (this.db.prepare('SELECT payload FROM vault_entries ORDER BY id;').all() as Array<{ payload: string }>)
      .map((r) => JSON.parse(r.payload) as StoreData['vault'][number]);
    const watches = (this.db.prepare('SELECT payload FROM watches ORDER BY id;').all() as Array<{ payload: string }>)
      .map((r) => JSON.parse(r.payload) as StoreData['watches'][number]);
    const cognitiveRow = this.db.prepare('SELECT payload FROM cognitive WHERE id = 1;').get() as { payload?: string } | undefined;

    if (!cognitiveRow?.payload) {
      throw new Error('store repository has no cognitive profile');
    }
    return parseStoreData<StoreData>({
      nextProjectId: meta('nextProjectId', 1),
      nextVaultId: meta('nextVaultId', 1),
      nextWatchId: meta('nextWatchId', 1),
      nextDialogueId: meta('nextDialogueId', 1),
      projects,
      vault,
      watches,
      cognitive: JSON.parse(cognitiveRow.payload),
    });
  }

  private writeTransaction(data: StoreData): void {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.exec('DELETE FROM projects; DELETE FROM vault_entries; DELETE FROM watches; DELETE FROM cognitive;');
      const insertProject = this.db.prepare('INSERT INTO projects (id, payload) VALUES (?, ?);');
      for (const p of data.projects) insertProject.run(p.id, JSON.stringify(p));
      const insertVault = this.db.prepare('INSERT INTO vault_entries (id, payload) VALUES (?, ?);');
      for (const v of data.vault) insertVault.run(v.id, JSON.stringify(v));
      const insertWatch = this.db.prepare('INSERT INTO watches (id, payload) VALUES (?, ?);');
      for (const w of data.watches) insertWatch.run(w.id, JSON.stringify(w));
      this.db.prepare('INSERT INTO cognitive (id, payload) VALUES (1, ?);').run(JSON.stringify(data.cognitive));
      this.setMeta('nextProjectId', String(data.nextProjectId));
      this.setMeta('nextVaultId', String(data.nextVaultId));
      this.setMeta('nextWatchId', String(data.nextWatchId));
      this.setMeta('nextDialogueId', String(data.nextDialogueId));
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /** Atomically persists to SQLite, then refreshes the JSON mirror. */
  save(data: StoreData): void {
    this.writeTransaction(data);
    const raw = JSON.stringify(data, null, 2);
    const tmp = `${this.mirrorPath}.tmp`;
    fs.mkdirSync(path.dirname(this.mirrorPath), { recursive: true });
    fs.writeFileSync(tmp, raw, 'utf-8');
    fs.renameSync(tmp, this.mirrorPath);
    this.setMeta(MIRROR_HASH_KEY, sha256(raw));
  }

  close(): void {
    this.db.close();
  }
}
