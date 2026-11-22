import { isSafeRelativePath, sha256Hex } from './security';
import type { ExportBundleManifest, ProjectRecord } from './types';

export function sanitizeGitRemoteUrl(
  rawUrl: string,
  options: { allowLocal?: boolean } = {},
): { valid: boolean; sanitized: string; error?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, sanitized: '', error: 'يرجى إدخال رابط مستودع Git (HTTPS أو SSH).' };
  }
  if (/[\s;&|`$<>]/.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'رابط المستودع يحتوي على محارف غير مسموح بها.' };
  }
  // Reject embedded credentials in URL (e.g. https://token@github.com)
  if (/@/.test(trimmed) && !/^git@/.test(trimmed)) {
    return {
      valid: false,
      sanitized: '',
      error: 'يرجى عدم تضمين مفاتيح أو رموز وصول داخل رابط المستودع؛ استخدم متغيرات البيئة الآمنة.',
    };
  }
  if (/^(https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._/-]+(?:\.git)?|git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(?:\.git)?)$/.test(trimmed)) {
    return { valid: true, sanitized: trimmed };
  }
  if (options.allowLocal && /^(?:[a-zA-Z]:[\\/]|\/)[a-zA-Z0-9._/\\-]+$/.test(trimmed)) {
    const denied = /(?:^|[\\/])(?:Windows|Program Files|ProgramData|etc|usr|bin|sbin|var|sys)(?:[\\/]|$)/i;
    if (denied.test(trimmed) || trimmed.includes('..')) {
      return { valid: false, sanitized: '', error: 'مسار المستودع المحلي داخل منطقة نظام محظورة.' };
    }
    return { valid: true, sanitized: trimmed };
  }
  return {
    valid: false,
    sanitized: '',
    error: 'صيغة رابط Git غير صالحة (مثال: https://github.com/org/repo.git).',
  };
}

/** Strip shell/format metacharacters from a commit message before it reaches git. */
export function sanitizeCommitMessage(rawMessage: string, slug = 'project'): string {
  const clean = (rawMessage || '')
    .replace(/[\r\n\t\u0000-\u001f\u007f"'`$\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return clean || `chore: release ${slug} verified by GENESIS-OMEGA`;
}

export function sanitizeBranchName(rawBranch: string): string {
  const clean = (rawBranch || 'main').trim().replace(/[^a-zA-Z0-9._/-]/g, '');
  return clean && !clean.startsWith('-') ? clean : 'main';
}

export function buildExportBundleManifest(
  project: ProjectRecord,
  options: {
    mode: 'local_bundle' | 'git_deploy';
    remoteUrl?: string;
    branch?: string;
    commitMessage?: string;
    allowLocalRemote?: boolean;
  },
): ExportBundleManifest {
  let slug = project.title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = `omega-project-${project.id}`;

  const filesSummary: Array<{ path: string; sizeBytes: number; sha256: string }> = [];
  let totalBytes = 0;

  for (const [relPath, content] of Object.entries(project.files).sort(([a], [b]) => a.localeCompare(b))) {
    const safe = isSafeRelativePath(relPath);
    if (!safe) continue;
    const sizeBytes = new TextEncoder().encode(content).byteLength;
    totalBytes += sizeBytes;
    filesSummary.push({
      path: safe,
      sizeBytes,
      sha256: sha256Hex(content),
    });
  }

  let deployScript: string | undefined;
  let sanitizedRemoteUrl: string | undefined;
  const branch = sanitizeBranchName(options.branch || 'main');

  if (options.mode === 'git_deploy') {
    const check = sanitizeGitRemoteUrl(options.remoteUrl || '', {
      allowLocal: options.allowLocalRemote === true,
    });
    if (!check.valid) {
      throw new Error(check.error || 'رابط مستودع Git غير صالح.');
    }
    sanitizedRemoteUrl = check.sanitized;
    const safeCommitMsg = sanitizeCommitMessage(options.commitMessage || '', slug);

    deployScript = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      `REMOTE_URL="${sanitizedRemoteUrl}"`,
      `BRANCH="${branch}"`,
      '',
      'git init -b "$BRANCH"',
      'git add .',
      `git commit -m "${safeCommitMsg}" || true`,
      'git remote remove origin 2>/dev/null || true',
      'git remote add origin "$REMOTE_URL"',
      'git push -u origin "$BRANCH"',
      '',
    ].join('\n');
  }

  return {
    projectId: project.id,
    slug,
    mode: options.mode,
    fileCount: filesSummary.length,
    totalBytes,
    sanitizedRemoteUrl,
    branch: options.mode === 'git_deploy' ? branch : undefined,
    deployScript,
    filesSummary,
    generatedAt: new Date().toISOString(),
  };
}
