import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreRepository } from './store_repository';
import type { StoreData } from './types';

function sampleStore(title: string): StoreData {
  return {
    nextProjectId: 2,
    nextVaultId: 1,
    nextWatchId: 1,
    nextDialogueId: 1,
    projects: [
      {
        id: 1,
        title,
        prompt: 'Build an API',
        mode: 'new',
        status: 'verified',
        language: 'Python 3.12',
        ecosystemKey: 'python',
        score: 97,
        testsRun: 4,
        redTeamStatus: 'survived',
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        liveLogs: '',
        reportMd: '',
        reasoningBrief: '',
        predictedRequirements: [],
        files: { 'main.py': 'print(1)\n' },
        baselineFiles: {},
        diffs: [],
        sandbox: { running: false, port: null, url: null, startedAt: null, logs: '' },
        benchmark: null,
        sbom: null,
        diagrams: { erdMermaid: '', sequenceMermaid: '', entities: [], endpoints: [] },
        legacyMigration: null,
      } as StoreData['projects'][number],
    ],
    vault: [{ id: 1, domain: 'SQLite', pattern: 'WAL', verifiedWisdom: 'Use PRAGMA journal_mode=WAL', createdAt: '' }],
    watches: [{ id: 1, folderPath: 'data/watched_demo', goal: 'audit', intervalSec: 30, enabled: true, filesCount: 0, lastCheckedAt: '', lastTriggeredProjectId: null, changedFiles: [] } as StoreData['watches'][number]],
    cognitive: { traits: {}, recentDialogue: [], pendingSuggestion: null },
  };
}

function tempRepo(): { dir: string; dbPath: string; mirror: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-repo-'));
  return { dir, dbPath: path.join(dir, 'omega_store.db'), mirror: path.join(dir, 'omega_store.json') };
}

test('repository uses WAL journal mode and round-trips the full store', () => {
  const { dir, dbPath, mirror } = tempRepo();
  const repo = new StoreRepository(dbPath, mirror);
  try {
    assert.match(repo.journalMode(), /^wal$/i);
    const store = sampleStore('Round Trip');
    repo.save(store);
    const loaded = repo.load();
    assert.equal(loaded.projects[0].title, 'Round Trip');
    assert.equal(loaded.nextProjectId, 2);
    assert.equal(loaded.vault[0].domain, 'SQLite');
    assert.equal(loaded.watches[0].enabled, true);
    assert.ok(fs.existsSync(mirror), 'JSON mirror must be written for backup compatibility');
  } finally {
    repo.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});

test('legacy JSON is imported, and a restored mirror is re-imported', () => {
  const { dir, dbPath, mirror } = tempRepo();
  fs.writeFileSync(mirror, JSON.stringify(sampleStore('From JSON')));
  const first = new StoreRepository(dbPath, mirror);
  try {
    const imported = first.importLegacyIfNeeded();
    assert.equal(imported.imported, true);
    assert.equal(first.load().projects[0].title, 'From JSON');
    const second = first.importLegacyIfNeeded();
    assert.equal(second.imported, false);
    assert.match(second.reason, /already applied/);
  } finally {
    first.close();
  }

  // Simulate `npm run restore`: the JSON file is replaced while the DB persists.
  fs.writeFileSync(mirror, JSON.stringify(sampleStore('Restored JSON')));
  const reopened = new StoreRepository(dbPath, mirror);
  try {
    const imported = reopened.importLegacyIfNeeded();
    assert.equal(imported.imported, true);
    assert.equal(reopened.load().projects[0].title, 'Restored JSON');
  } finally {
    reopened.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});

test('a corrupt mirror fails closed through the Zod schema', () => {
  const { dir, dbPath, mirror } = tempRepo();
  fs.writeFileSync(mirror, '{"projects":"not-an-array"}');
  const repo = new StoreRepository(dbPath, mirror);
  try {
    assert.throws(() => repo.importLegacyIfNeeded());
  } finally {
    repo.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
