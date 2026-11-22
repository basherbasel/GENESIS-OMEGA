import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeExportToDisk } from './export_fs';
import type { ExportBundleManifest, ProjectRecord } from './types';

function manifestFor(id: number, slug: string): ExportBundleManifest {
  return {
    projectId: id,
    slug,
    mode: 'local_bundle',
    fileCount: 2,
    totalBytes: 0,
    filesSummary: [],
    generatedAt: new Date().toISOString(),
  };
}

test('materializeExportToDisk writes files, a manifest and rejects traversal paths', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-export-'));
  const project = {
    id: 77,
    files: {
      'main.py': 'print(1)\n',
      'src/index.js': 'console.log(1);\n',
      '../evil.txt': 'should not escape',
    },
  } as unknown as ProjectRecord;
  try {
    const result = await materializeExportToDisk(base, project, manifestFor(77, 'demo-77'));
    const dir = result.exportedAbsDir || path.join(base, result.slug);
    assert.ok(fs.existsSync(path.join(dir, 'main.py')));
    assert.ok(fs.existsSync(path.join(dir, 'src', 'index.js')));
    assert.ok(fs.existsSync(path.join(dir, 'EXPORT_MANIFEST.json')));
    assert.equal(fs.existsSync(path.resolve(base, 'evil.txt')), false, 'traversal path escaped the bundle');
    assert.ok((result.exportedDir || '').includes('demo-77'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
