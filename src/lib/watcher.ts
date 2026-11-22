import fs from 'node:fs';
import path from 'node:path';
import { isSafeRelativePath, sha256Hex } from './security';

const FORBIDDEN_SYSTEM_PREFIXES = [
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/bin',
  '/sbin',
  '/usr',
  '/root',
  '/var',
  '/boot',
  '/lib',
];

const IGNORED_WATCH_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', '.next', 'venv', '.venv']);

/** True when a path points into an OS/system or user-profile root that must never be watched. */
function isForbiddenSystemPath(target: string): boolean {
  const normalized = path.resolve(target);
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  const roots = [
    ...FORBIDDEN_SYSTEM_PREFIXES,
    process.env.SystemRoot || '',
    process.env.WINDIR || '',
    process.env.ProgramFiles || '',
    process.env['ProgramFiles(x86)'] || '',
    process.env.ProgramData || '',
  ].filter(Boolean);
  return roots.some((raw) => {
    const root = path.resolve(raw);
    const rootKey = process.platform === 'win32' ? root.toLowerCase() : root;
    return key === rootKey || key.startsWith(rootKey + path.sep);
  });
}

export interface WatchedDirectoryInspection {
  resolvedPath: string;
  filesCount: number;
  treeHash: string;
  files: Record<string, string>;
  fileHashes: Record<string, string>;
}

export function resolveSafeWatchPath(rawPath: string, workspaceRoot: string): { valid: boolean; resolved: string; error?: string } {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) {
    return { valid: false, resolved: '', error: 'يرجى إدخال مسار المجلد المحلي للمراقبة.' };
  }
  if (trimmed.includes('\0') || /[;&|`$<>]/.test(trimmed)) {
    return { valid: false, resolved: '', error: 'المسار يحتوي على محارف غير صالحة.' };
  }

  const candidate = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(workspaceRoot, trimmed);

  if (candidate === path.parse(candidate).root) {
    return { valid: false, resolved: '', error: 'لا يمكن مراقبة جذر النظام مباشرة.' };
  }

  if (isForbiddenSystemPath(candidate)) {
    return { valid: false, resolved: '', error: 'المسار محظور أمنياً (مجلد نظام أو ملف تعريف مستخدم).' };
  }

  if (!fs.existsSync(candidate)) {
    return { valid: false, resolved: '', error: `المجلد غير موجود على القرص: ${trimmed}` };
  }

  const real = fs.realpathSync(candidate);
  if (isForbiddenSystemPath(real)) {
    return { valid: false, resolved: '', error: 'المسار الحقيقي محظور أمنياً (مجلد نظام أو ملف تعريف مستخدم).' };
  }

  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    return { valid: false, resolved: '', error: 'المسار المحدد ليس مجلداً.' };
  }

  return { valid: true, resolved: real };
}

export function inspectWatchedDirectory(
  rawPath: string,
  workspaceRoot: string,
  previousTreeHash?: string,
  previousFileHashes?: Record<string, string>,
): {
  ok: boolean;
  error?: string;
  inspection?: WatchedDirectoryInspection;
  changed?: boolean;
  changedFiles?: string[];
} {
  const pathCheck = resolveSafeWatchPath(rawPath, workspaceRoot);
  if (!pathCheck.valid) {
    return { ok: false, error: pathCheck.error };
  }

  const root = pathCheck.resolved;
  const files: Record<string, string> = {};
  const fileHashes: Record<string, string> = {};

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (IGNORED_WATCH_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (Object.keys(files).length < 150) walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.db') || entry.name.endsWith('.pyc')) continue;
        const rel = path.relative(root, fullPath).split(path.sep).join('/');
        const safeRel = isSafeRelativePath(rel);
        if (!safeRel) continue;
        const st = fs.statSync(fullPath);
        if (st.size > 512 * 1024) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        files[safeRel] = content;
        fileHashes[safeRel] = sha256Hex(content);
      }
    }
  }

  walk(root);

  const hashSeed = Object.keys(fileHashes)
    .sort()
    .map((k) => `${k}:${fileHashes[k]}`)
    .join('\n');
  const treeHash = sha256Hex(hashSeed || 'empty');
  const treeChanged = Boolean(previousTreeHash && previousTreeHash !== treeHash);

  // Compare per-file hashes so the UI lists files that truly changed (added,
  // modified, or deleted) instead of dumping every file in the directory.
  const changedSet = new Set<string>();
  if (previousFileHashes && treeChanged) {
    for (const [rel, hash] of Object.entries(fileHashes)) {
      if (previousFileHashes[rel] !== hash) changedSet.add(rel);
    }
    for (const rel of Object.keys(previousFileHashes)) {
      if (!(rel in fileHashes)) changedSet.add(rel);
    }
  }

  return {
    ok: true,
    inspection: {
      resolvedPath: root,
      filesCount: Object.keys(files).length,
      treeHash,
      files,
      fileHashes,
    },
    changed: treeChanged,
    changedFiles: treeChanged ? Array.from(changedSet).slice(0, 12) : [],
  };
}

export function ensureDemoWatchWorkspace(dataDir: string): string {
  const demoDir = path.join(dataDir, 'watched_demo', 'billing_service');
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(
      path.join(demoDir, 'app.py'),
      [
        'import sqlite3',
        '',
        'def compute_invoice_total(subtotal: float, tax_rate: float = 0.15) -> float:',
        '    if subtotal < 0 or tax_rate < 0:',
        '        raise ValueError("Amounts must be non-negative")',
        '    return round(subtotal * (1.0 + tax_rate), 2)',
        '',
      ].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(demoDir, 'test_app.py'),
      [
        'import unittest',
        'from app import compute_invoice_total',
        '',
        'class TestBilling(unittest.TestCase):',
        '    def test_total(self):',
        '        self.assertEqual(compute_invoice_total(100.0), 115.0)',
        '',
        'if __name__ == "__main__":',
        '    unittest.main()',
        '',
      ].join('\n'),
      'utf-8',
    );
  }
  return path.relative(process.cwd(), demoDir).split(path.sep).join('/');
}
