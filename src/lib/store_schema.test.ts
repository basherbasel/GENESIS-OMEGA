import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidStoreData, parseStoreData } from './store_schema';

function validStore(): Record<string, unknown> {
  return {
    nextProjectId: 4,
    nextVaultId: 4,
    nextWatchId: 3,
    nextDialogueId: 2,
    projects: [{ id: 1, title: 'Demo', prompt: 'Build an API', status: 'verified', files: { 'main.py': 'x=1\n' } }],
    vault: [{ id: 1, domain: 'SQLite', pattern: 'WAL', verifiedWisdom: 'Use PRAGMA journal_mode=WAL' }],
    watches: [{ id: 1, folderPath: 'data/watched_demo', enabled: true }],
    cognitive: { traits: {}, recentDialogue: [{ id: 1, role: 'assistant', content: 'hello' }], pendingSuggestion: null },
  };
}

test('valid store data passes and keeps unknown fields', () => {
  const raw = { ...validStore(), extraField: 'preserved' } as Record<string, unknown>;
  assert.equal(isValidStoreData(raw), true);
  const parsed = parseStoreData<{ projects: unknown[]; extraField?: string }>(raw);
  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.extraField, 'preserved');
});

test('corrupt store data is rejected before the server can dereference it', () => {
  assert.throws(() => parseStoreData({ ...validStore(), projects: 'not-an-array' }));
  assert.throws(() => parseStoreData({ ...validStore(), cognitive: {} }));
  assert.throws(() => parseStoreData({ ...validStore(), nextProjectId: -1 }));
  assert.equal(isValidStoreData({ projects: [] }), false);
});
