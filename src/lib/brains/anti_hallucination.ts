/**
 * Zero-hallucination grounding and strict model-output enforcement (v4).
 *
 * Deterministically resolves imports and internal symbols against the real
 * workspace and the real repo index before any compiler or healing cycle runs.
 * No inference happens here; this is a pure, bounded, fail-closed gate.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { RepoIndex } from './repo_indexer';
import { isSafeRelativePath } from '../security';

export type GroundingCode = 'HALLUCINATED_IMPORT' | 'UNRESOLVED_SYMBOL';

export interface GroundingFinding {
  code: GroundingCode;
  file: string;
  line: number;
  detail: string;
  value: string;
}

export interface GroundingInput {
  workspaceDir: string;
  generatedFiles: Record<string, string>;
  repoIndex?: RepoIndex;
}

export interface GroundingResult {
  findings: GroundingFinding[];
  blocked: boolean;
  checkedImports: number;
  checkedSymbols: number;
  filesChecked: number;
}

const STANDARD_MODULES = new Set([
  // JS/TS
  'fs', 'path', 'os', 'util', 'crypto', 'child_process', 'events', 'stream', 'url', 'http', 'https', 'assert', 'buffer',
  'node:fs', 'node:path', 'node:os', 'node:util', 'node:crypto', 'node:child_process', 'node:events', 'node:test',
  'react', 'react-dom', 'express', 'zod', 'vitest', '@playwright/test',
  // Python
  'sys', 'json', 'math', 'time', 'datetime', 'sqlite3', 'hashlib', 'subprocess', 'argparse', 'collections', 'itertools',
  'functools', 'typing', 'unittest', 'pathlib', 're', 'random', 'statistics', 'csv', 'os',
  // Go / Rust / Java / C# / C / Ruby / PHP
  'fmt', 'strings', 'sync', 'context', 'net/http', 'testing', 'std', 'core', 'alloc', 'System', 'System.IO',
  'java.util', 'java.io', 'java.sql', 'openssl', 'pthread', 'json', 'set', 'math', 'date',
]);

const SOURCE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.java', '.cs', '.php', '.rb', '.lua',
  '.dart', '.f90', '.pas', '.cob',
];

const IMPORT_PATTERNS: RegExp[] = [
  /(?:^|\s)(?:import|export)\s+(?:[\s\S]{0,160}?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*from\s+([\w.]+)\s+import\s+/gm,
  /^\s*import\s+([\w.]+)\s*$/gm,
  /^\s*use\s+([\w:]+)\s*;/gm,
  /^\s*import\s+"([^"]+)"/gm,
  /^\s*#\s*include\s+"([^"]+)"/gm,
  /^\s*(?:require_once|include_once|require|include)\s+['"]([^'"]+)['"]/gm,
  /^\s*import\s+([\w.]+)\s*;/gm,
  /^\s*use\s+([A-Z][\w\\]+)\s*;/gm,
];

const CALL_PATTERN = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const NON_SYMBOLS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'await', 'async',
  'console.log', 'JSON', 'String', 'Number', 'Array', 'Object', 'Map', 'Set', 'Promise', 'Math',
  'assert', 'test', 'describe', 'it', 'expect', 'print', 'len', 'range', 'str', 'int', 'float',
  'list', 'dict', 'set', 'tuple', 'open', 'isinstance', 'super', 'self', 'sizeof', 'make', 'append',
  'fmt', 'println', 'require', 'include', 'use', 'import', 'SELECT', 'INSERT', 'UPDATE', 'DELETE',
]);

function readManifestDependencies(workspaceDir: string): Set<string> {
  const deps = new Set<string>();
  const pkgPath = path.join(workspaceDir, 'package.json');
  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const key of Object.keys(pkg.dependencies || {})) deps.add(key);
      for (const key of Object.keys(pkg.devDependencies || {})) deps.add(key);
    }
  } catch {
    // malformed manifest means no external dependency is trusted
  }
  for (const [name, regex] of [
    ['requirements.txt', /^\s*([A-Za-z0-9_.\-]+)/gm],
    ['Cargo.toml', /^\s*(?:\[dependencies\.[^\]]+\]|([A-Za-z0-9_\-]+)\s*=)/gm],
    ['go.mod', /^\s*(?:require\s+)?([A-Za-z0-9_.\-/]+)\s+v?\d/gm],
  ] as Array<[string, RegExp]>) {
    try {
      const file = path.join(workspaceDir, name);
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(regex)) {
        const value = match[1];
        if (value) deps.add(value.split('/')[0]);
      }
    } catch {
      // keep scanning other manifests
    }
  }
  return deps;
}

function collectImports(content: string): Array<{ value: string; line: number }> {
  const results: Array<{ value: string; line: number }> = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const value = (match[1] || '').trim();
      if (!value || value.startsWith('node:')) {
        if (value.startsWith('node:')) results.push({ value, line: lineAt(content, match.index) });
        continue;
      }
      results.push({ value, line: lineAt(content, match.index) });
    }
  }
  return results;
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function localTargetExists(fromFile: string, specifier: string, knownFiles: Set<string>): boolean {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = ext ? `${base}${ext}` : base;
    if (knownFiles.has(candidate) || knownFiles.has(path.posix.join(candidate, `index${ext}`))) return true;
    if (knownFiles.has(path.posix.join(base, `index${ext}`))) return true;
  }
  return false;
}

function knownSymbolsOf(index: RepoIndex | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const symbol of index?.symbols || []) {
    if (!map.has(symbol.name)) map.set(symbol.name, symbol.file);
  }
  return map;
}

function definedNames(content: string): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /(?:function|class|interface|type|struct|enum|trait|def|module|subroutine|procedure)\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) names.add(match[1]);
  }
  return names;
}

/** Real import/symbol grounding: rejects invented modules and phantom calls. */
export function verifyImportsAndSymbols(input: GroundingInput): GroundingResult {
  const findings: GroundingFinding[] = [];
  const generated = Object.entries(input.generatedFiles).sort((a, b) => a[0].localeCompare(b[0]));
  const knownFiles = new Set([
    ...generated.map(([file]) => file),
    ...(input.repoIndex?.files || []).map((file) => file.path),
  ]);
  const externalDeps = readManifestDependencies(input.workspaceDir);
  const globalSymbols = knownSymbolsOf(input.repoIndex);
  let checkedImports = 0;
  let checkedSymbols = 0;

  for (const [file, content] of generated) {
    if (!isSafeRelativePath(file)) {
      findings.push({ code: 'HALLUCINATED_IMPORT', file, line: 1, detail: 'unsafe generated file path', value: file });
      continue;
    }
    const localDefinitions = definedNames(content);
    const imports = collectImports(content);
    const importedNames = new Set<string>();
    for (const group of content.matchAll(/\bimport\s*\{([^}]+)\}\s*from/g)) {
      for (const name of group[1].split(',')) {
        const clean = name.trim().split(/\s+as\s+/)[0].trim();
        if (clean) importedNames.add(clean);
      }
    }
    for (const { value, line } of imports) {
      checkedImports += 1;
      if (value.startsWith('node:')) continue;
      if (value.startsWith('.')) {
        if (!localTargetExists(file, value, knownFiles)) {
          findings.push({
            code: 'HALLUCINATED_IMPORT',
            file,
            line,
            detail: `relative import does not resolve to a real file: ${value}`,
            value,
          });
        }
        continue;
      }
      const head = value.replace(/^@/, '@').split('/')[0];
      const top = value.split(/[.:\\]/)[0];
      if (STANDARD_MODULES.has(value) || STANDARD_MODULES.has(head) || STANDARD_MODULES.has(top)) continue;
      if (externalDeps.has(value) || externalDeps.has(head)) continue;
      if (knownFiles.has(value)) continue;
      findings.push({
        code: 'HALLUCINATED_IMPORT',
        file,
        line,
        detail: `module is neither a standard library nor a declared/manifest dependency: ${value}`,
        value,
      });
    }

    for (const match of content.matchAll(CALL_PATTERN)) {
      const name = match[1];
      checkedSymbols += 1;
      if (NON_SYMBOLS.has(name) || localDefinitions.has(name) || importedNames.has(name)) continue;
      const origin = globalSymbols.get(name);
      if (!origin) continue;
      if (origin === file) continue;
      const importsOrigin = imports.some((item) => item.value.endsWith(path.posix.basename(origin, path.posix.extname(origin))));
      if (!importsOrigin) {
        findings.push({
          code: 'UNRESOLVED_SYMBOL',
          file,
          line: lineAt(content, match.index || 0),
          detail: `call to symbol defined in ${origin} without a matching import`,
          value: name,
        });
      }
    }
  }

  return {
    findings,
    blocked: findings.length > 0,
    checkedImports,
    checkedSymbols,
    filesChecked: generated.length,
  };
}

export class StrictOutputError extends Error {
  readonly code: 'STRICT_JSON_FAILED' | 'PATCH_ANCHOR_MISSING';

  constructor(code: 'STRICT_JSON_FAILED' | 'PATCH_ANCHOR_MISSING', message: string) {
    super(message);
    this.name = 'StrictOutputError';
    this.code = code;
  }
}

/** Strips only outer markdown fences, then validates the full schema. */
export function parseStrictModelOutput<T>(
  rawText: string,
  validator: (value: unknown) => T,
  options: { files?: Record<string, string> } = {},
): T {
  const trimmed = (rawText || '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = (fenced ? fenced[1] : trimmed).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new StrictOutputError('STRICT_JSON_FAILED', `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  let value: T;
  try {
    value = validator(parsed);
  } catch (err) {
    throw new StrictOutputError('STRICT_JSON_FAILED', `schema rejection: ${err instanceof Error ? err.message : String(err)}`);
  }
  const patches = (value as { patches?: unknown })?.patches;
  if (Array.isArray(patches)) {
    for (const item of patches.slice(0, 40)) {
      const patch = item as { path?: unknown; search?: unknown };
      if (typeof patch.path !== 'string' || typeof patch.search !== 'string' || !patch.search) {
        throw new StrictOutputError('STRICT_JSON_FAILED', 'patch requires path and non-empty search');
      }
      const safe = isSafeRelativePath(patch.path);
      const source = options.files?.[safe || patch.path];
      if (!safe || source === undefined) {
        throw new StrictOutputError('PATCH_ANCHOR_MISSING', `patch target missing: ${patch.path}`);
      }
      if (!source.includes(patch.search)) {
        throw new StrictOutputError('PATCH_ANCHOR_MISSING', `search anchor is not verbatim in ${patch.path}`);
      }
    }
  }
  return value;
}
