/**
 * Atomic SEARCH/REPLACE patcher for existing project files.
 *
 * Every path passes the project's traversal guard; every changed file is
 * validated before commit; any failure rolls the whole batch back to the
 * original file map. No process is spawned and no dependency is used.
 */

import { isSafeRelativePath } from '../security';

export type PatchErrorCode =
  | 'UNSAFE_PATH'
  | 'FILE_NOT_FOUND'
  | 'SEARCH_NOT_FOUND'
  | 'AMBIGUOUS_SEARCH'
  | 'SYNTAX_INVALID'
  | 'PATCH_FAILED';

export interface PatchRequest {
  path: string;
  search: string;
  replace: string;
  /** 1-based occurrence to replace; required when the search string repeats. */
  occurrence?: number;
}

export interface PatchFailure {
  path: string;
  code: PatchErrorCode;
  message: string;
}

export interface PatchResult {
  ok: boolean;
  files: Record<string, string>;
  changedFiles: string[];
  failures: PatchFailure[];
}

export type PatchValidator = (filePath: string, content: string) => string | null;

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.java', '.cs']);

/** Conservative delimiter check; returns null when balanced. */
export function checkDelimiterBalance(filePath: string, content: string): string | null {
  const ext = pathExtension(filePath);
  if (!CODE_EXTENSIONS.has(ext)) return null;
  const stack: string[] = [];
  const pairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
  let quote: string | null = null;
  let blockComment = false;
  let lineComment = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '#' && ext === '.py') {
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{' || char === '(' || char === '[') stack.push(char);
    if (char in pairs) {
      const expected = pairs[char];
      if (stack.pop() !== expected) return `unmatched '${char}'`;
    }
  }
  if (stack.length > 0) return `unclosed '${stack[stack.length - 1]}'`;
  return null;
}

function pathExtension(filePath: string): string {
  const safe = isSafeRelativePath(filePath) || filePath;
  const base = safe.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot).toLowerCase();
}

export function defaultPatchValidator(filePath: string, content: string): string | null {
  if (pathExtension(filePath) === '.json') {
    try {
      JSON.parse(content);
      return null;
    } catch (err) {
      return `invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return checkDelimiterBalance(filePath, content);
}

function replaceOccurrence(content: string, search: string, replace: string, occurrence: number): string {
  let from = 0;
  let seen = 0;
  for (;;) {
    const index = content.indexOf(search, from);
    if (index < 0) return content;
    seen += 1;
    if (seen === occurrence) {
      return content.slice(0, index) + replace + content.slice(index + search.length);
    }
    from = index + search.length;
  }
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const index = content.indexOf(search, from);
    if (index < 0) return count;
    count += 1;
    from = index + search.length;
  }
}

export function applySurgicalPatches(
  files: Record<string, string>,
  patches: PatchRequest[],
  validator: PatchValidator = defaultPatchValidator,
): PatchResult {
  const working: Record<string, string> = { ...files };
  const changed = new Set<string>();
  const failures: PatchFailure[] = [];

  // Validate all paths before touching a single byte.
  for (const patch of patches) {
    const safe = isSafeRelativePath(patch.path);
    if (!safe) {
      failures.push({ path: patch.path, code: 'UNSAFE_PATH', message: 'unsafe or traversal path rejected' });
      continue;
    }
    if (!(safe in working)) {
      failures.push({ path: safe, code: 'FILE_NOT_FOUND', message: 'file does not exist in the project' });
      continue;
    }
    if (!patch.search) {
      failures.push({ path: safe, code: 'SEARCH_NOT_FOUND', message: 'empty search string' });
      continue;
    }
  }
  if (failures.length > 0) {
    return { ok: false, files, changedFiles: [], failures };
  }

  for (const patch of patches) {
    const safe = isSafeRelativePath(patch.path)!;
    const content = working[safe];
    const total = countOccurrences(content, patch.search);
    if (total === 0) {
      failures.push({ path: safe, code: 'SEARCH_NOT_FOUND', message: 'search string not present' });
      continue;
    }
    const occurrence = patch.occurrence ?? 1;
    if (patch.occurrence === undefined && total > 1) {
      failures.push({ path: safe, code: 'AMBIGUOUS_SEARCH', message: `search string appears ${total} times; specify occurrence` });
      continue;
    }
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > total) {
      failures.push({ path: safe, code: 'SEARCH_NOT_FOUND', message: `occurrence ${occurrence} out of range (1-${total})` });
      continue;
    }
    working[safe] = replaceOccurrence(content, patch.search, patch.replace, occurrence);
    changed.add(safe);
  }
  if (failures.length > 0) {
    return { ok: false, files, changedFiles: [], failures };
  }

  for (const filePath of changed) {
    const error = validator(filePath, working[filePath]);
    if (error) {
      failures.push({ path: filePath, code: 'SYNTAX_INVALID', message: error });
    }
  }
  if (failures.length > 0) {
    return { ok: false, files, changedFiles: [], failures };
  }

  return { ok: true, files: working, changedFiles: Array.from(changed).sort(), failures: [] };
}
