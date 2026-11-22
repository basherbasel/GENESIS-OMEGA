/**
 * Restore a verified backup into the project root.
 *
 * Usage: tsx scripts/restore.ts <backup-dir> [--yes]
 * Exits 0 on success and 1 on any failure. The manifest is validated and every
 * stored file's SHA-256 is checked before a single byte is written back.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

interface FileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

interface ManifestEntry {
  source: string;
  type: 'file' | 'dir';
  included: boolean;
  bytes?: number;
  sha256?: string;
  fileCount?: number;
  files?: FileRecord[];
}

interface Manifest {
  schema: number;
  id: string;
  createdAt: string;
  generator: string;
  projectRoot: string;
  retention: number;
  excluded: string[];
  entries: ManifestEntry[];
}

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found above scripts/restore.ts');
    dir = parent;
  }
}

function safeRelative(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!normalized || normalized.includes('\0') || parts.length === 0) {
    throw new Error(`unsafe path in manifest: ${relPath}`);
  }
  for (const part of parts) {
    if (part === '.' || part === '..' || /^[a-zA-Z]:/.test(part)) {
      throw new Error(`unsafe path in manifest: ${relPath}`);
    }
  }
  return parts.join('/');
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readManifest(backupDir: string): Manifest {
  const manifestPath = path.join(backupDir, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`MANIFEST.json missing in ${backupDir}`);
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
  if (parsed?.schema !== 1) throw new Error('unsupported MANIFEST schema');
  if (typeof parsed.id !== 'string' || parsed.id !== path.basename(backupDir)) {
    throw new Error('manifest id does not match backup directory name');
  }
  if (!Array.isArray(parsed.entries)) throw new Error('manifest entries missing');
  return parsed;
}

function verifyBeforeWrite(backupDir: string, manifest: Manifest): Array<{ from: string; to: string }> {
  const plan: Array<{ from: string; to: string }> = [];
  for (const entry of manifest.entries) {
    if (!entry.included) continue;
    const rel = safeRelative(entry.source);
    if (entry.type === 'file') {
      const stored = path.join(backupDir, rel);
      if (!fs.existsSync(stored)) throw new Error(`backup file missing: ${rel}`);
      if (sha256File(stored) !== entry.sha256) throw new Error(`checksum mismatch: ${rel}`);
      plan.push({ from: stored, to: rel });
      continue;
    }
    if (entry.type === 'dir') {
      for (const record of entry.files || []) {
        const recordRel = safeRelative(record.path);
        const stored = path.join(backupDir, recordRel);
        if (!fs.existsSync(stored)) throw new Error(`backup file missing: ${recordRel}`);
        if (sha256File(stored) !== record.sha256) throw new Error(`checksum mismatch: ${recordRel}`);
        plan.push({ from: stored, to: recordRel });
      }
      continue;
    }
    throw new Error(`unknown manifest entry type: ${String(entry.type)}`);
  }
  return plan;
}

async function main(): Promise<void> {
  const root = findProjectRoot();
  const arg = process.argv[2];
  if (!arg) throw new Error('usage: npm run restore -- <backup-dir> [--yes]');

  const backupsRoot = path.join(root, 'backups');
  const backupDir = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const inside = path.relative(backupsRoot, backupDir);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new Error(`backup dir must be inside ${path.relative(root, backupsRoot)}`);
  }

  const manifest = readManifest(backupDir);
  const plan = verifyBeforeWrite(backupDir, manifest);

  if (!process.argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This will overwrite ${plan.length} file(s) in ${root}. Type YES to confirm: `,
    );
    rl.close();
    if (answer.trim().toUpperCase() !== 'YES') {
      console.log('RESTORE_ABORTED: confirmation not given');
      process.exit(1);
      return;
    }
  }

  for (const item of plan) {
    const target = path.join(root, item.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Git object files and other stored artifacts can be read-only. On Windows
    // copyFileSync over such a target raises EPERM, so temporarily grant write
    // permission and restore the original mode afterwards.
    const sourceMode = fs.statSync(item.from).mode;
    if (fs.existsSync(target)) fs.chmodSync(target, sourceMode | 0o200);
    fs.copyFileSync(item.from, target);
    fs.chmodSync(target, sourceMode);
  }
  console.log(`RESTORE_OK id=${manifest.id} files=${plan.length} from=${path.relative(root, backupDir)}`);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(`RESTORE_FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
