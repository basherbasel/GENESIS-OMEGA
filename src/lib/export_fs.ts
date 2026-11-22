import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { isSafeRelativePath } from './security';
import type { ExportBundleManifest, ProjectRecord } from './types';

const execFileAsync = promisify(execFile);

export async function materializeExportToDisk(
  exportBaseDir: string,
  project: ProjectRecord,
  manifest: ExportBundleManifest,
): Promise<ExportBundleManifest> {
  const safeSlug = manifest.slug.replace(/[^a-zA-Z0-9._-]/g, '-') || `omega-project-${project.id}`;
  const baseResolved = path.resolve(exportBaseDir);
  const targetDir = path.resolve(baseResolved, safeSlug);

  if (!targetDir.startsWith(baseResolved + path.sep)) {
    throw new Error('مسار التصدير المحدد غير مسموح به.');
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const [relPath, content] of Object.entries(project.files)) {
    const safeRel = isSafeRelativePath(relPath);
    if (!safeRel) continue;
    const dest = path.resolve(targetDir, safeRel);
    if (dest !== targetDir && !dest.startsWith(targetDir + path.sep)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf-8');
  }

  fs.writeFileSync(
    path.join(targetDir, 'EXPORT_MANIFEST.json'),
    JSON.stringify({ ...manifest, exportedDir: path.relative(process.cwd(), targetDir).split(path.sep).join('/') }, null, 2),
    'utf-8',
  );

  let gitInitialized = false;
  if (manifest.mode === 'git_deploy') {
    const branch = manifest.branch || 'main';
    try {
      await execFileAsync('git', ['init', '-b', branch], { cwd: targetDir, timeout: 6000 });
    } catch {
      await execFileAsync('git', ['init'], { cwd: targetDir, timeout: 6000 });
    }
    try {
      await execFileAsync('git', ['add', '.'], { cwd: targetDir, timeout: 6000 });
      if (manifest.sanitizedRemoteUrl) {
        try {
          await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: targetDir, timeout: 4000 });
        } catch {
          // ignore if origin did not exist
        }
        await execFileAsync('git', ['remote', 'add', 'origin', manifest.sanitizedRemoteUrl], {
          cwd: targetDir,
          timeout: 4000,
        });
      }
      gitInitialized = true;
    } catch {
      gitInitialized = false;
    }
  }

  return {
    ...manifest,
    exportedDir: path.relative(process.cwd(), targetDir).split(path.sep).join('/'),
    exportedAbsDir: targetDir,
    gitInitialized,
  };
}
