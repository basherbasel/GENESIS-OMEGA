/**
 * Create a timestamped, integrity-checked backup of the studio's runtime state.
 *
 * Exits 0 on success and 1 on any failure. The project root is discovered by
 * walking up from this file until package.json is found — never from a magic
 * absolute path. Only .env, data/, omega_store.json and models.config.json are
 * included; node_modules, dist, *.gguf and the backups folder are excluded.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_SCHEMA = 1;
const MAX_BACKUPS = 30;
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'backups']);
const EXCLUDED_EXTENSIONS = new Set(['.gguf']);
const TOP_LEVEL_FILES = ['.env', 'omega_store.json', 'models.config.json'];

interface FileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

interface ManifestEntry {
  source: string;
  type: 'file' | 'dir';
  included: boolean;
  reason?: string;
  bytes?: number;
  sha256?: string;
  fileCount?: number;
  files?: FileRecord[];
}

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found above scripts/backup.ts');
    dir = parent;
  }
}

function safeRelative(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!normalized || normalized.includes('\0') || parts.length === 0) {
    throw new Error(`unsafe relative path: ${relPath}`);
  }
  for (const part of parts) {
    if (part === '.' || part === '..' || /^[a-zA-Z]:/.test(part)) {
      throw new Error(`unsafe relative path: ${relPath}`);
    }
  }
  return parts.join('/');
}

function sha256File(filePath: string): { bytes: number; sha256: string } {
  const buffer = fs.readFileSync(filePath);
  return { bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

function isExcluded(name: string): boolean {
  return EXCLUDED_DIRS.has(name) || EXCLUDED_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function collectFiles(absDir: string, relPrefix: string): Array<{ rel: string; abs: string }> {
  const found: Array<{ rel: string; abs: string }> = [];
  const walk = (abs: string, rel: string): void => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (isExcluded(entry.name)) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = safeRelative(`${rel}/${entry.name}`);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry.isFile()) {
        found.push({ rel: childRel, abs: childAbs });
      }
    }
  };
  walk(absDir, relPrefix);
  return found;
}

function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function pruneOldBackups(backupsRoot: string, keepId: string): string[] {
  const ids = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const removed = ids.filter((id) => id !== keepId).slice(MAX_BACKUPS - 1);
  for (const id of removed) {
    fs.rmSync(path.join(backupsRoot, id), { recursive: true, force: true });
  }
  return removed;
}

function main(): void {
  const root = findProjectRoot();
  const id = timestamp();
  const backupsRoot = path.join(root, 'backups');
  const destination = path.join(backupsRoot, id);
  fs.mkdirSync(destination, { recursive: true });

  const entries: ManifestEntry[] = [];

  for (const name of TOP_LEVEL_FILES) {
    const source = path.join(root, name);
    if (fs.existsSync(source) && fs.statSync(source).isFile()) {
      const target = path.join(destination, safeRelative(name));
      fs.copyFileSync(source, target);
      const digest = sha256File(target);
      entries.push({ source: name, type: 'file', included: true, ...digest });
    } else {
      entries.push({ source: name, type: 'file', included: false, reason: 'missing at source' });
    }
  }

  const dataSource = path.join(root, 'data');
  if (fs.existsSync(dataSource) && fs.statSync(dataSource).isDirectory()) {
    const files = collectFiles(dataSource, 'data');
    const records: FileRecord[] = [];
    let totalBytes = 0;
    for (const file of files) {
      const target = path.join(destination, safeRelative(file.rel));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.abs, target);
      const digest = sha256File(target);
      totalBytes += digest.bytes;
      records.push({ path: file.rel, ...digest });
    }
    entries.push({
      source: 'data',
      type: 'dir',
      included: true,
      fileCount: records.length,
      bytes: totalBytes,
      files: records,
    });
  } else {
    entries.push({ source: 'data', type: 'dir', included: false, reason: 'missing at source' });
  }

  const manifest = {
    schema: MANIFEST_SCHEMA,
    id,
    createdAt: new Date().toISOString(),
    generator: 'scripts/backup.ts',
    projectRoot: root,
    retention: MAX_BACKUPS,
    excluded: ['node_modules', 'dist', 'backups', '*.gguf'],
    entries,
  };
  fs.writeFileSync(path.join(destination, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const removed = pruneOldBackups(backupsRoot, id);
  const included = entries.filter((e) => e.included).length;
  console.log(`BACKUP_OK id=${id} dir=${path.relative(root, destination)}`);
  console.log(`entries=${included}/${entries.length} dataFiles=${entries.find((e) => e.source === 'data')?.fileCount ?? 0}`);
  if (removed.length) console.log(`pruned=${removed.length} oldest=${removed[0]}`);
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error(`BACKUP_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
