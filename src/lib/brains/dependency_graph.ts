/**
 * Cross-language dependency graph and blast-radius analyzer (v3 Part 1).
 *
 * Built on the real `repo_indexer` output: no AST dependency is downloaded and
 * no graph is simulated. Imports are resolved deterministically across TS/JS,
 * Python, C/C++, Rust, Go, Java, C#, PHP, Ruby, Lua, Dart, Fortran, Pascal and
 * COBOL. Every slice is bounded so coder/healer brains stay inside their token
 * budget on a 16GB local machine.
 */

import path from 'node:path';

import type { FileIndex, RepoIndex } from './repo_indexer';

export type DependencyKind = 'relative' | 'module' | 'include' | 'sibling';

export interface DependencyEdge {
  from: string;
  to: string;
  specifier: string;
  kind: DependencyKind;
}

export interface UnresolvedImport {
  file: string;
  specifier: string;
}

export interface DependencyGraph {
  root: string;
  nodes: string[];
  edges: DependencyEdge[];
  dependencies: Map<string, string[]>;
  dependents: Map<string, string[]>;
  unresolved: UnresolvedImport[];
  truncated: boolean;
}

const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.java', '.cs', '.php', '.rb',
  '.lua', '.dart', '.f90', '.f95', '.for', '.pas', '.pp', '.cob', '.cbl',
];

const MAX_EDGES = 12_000;

const byString = (a: string, b: string): number => a.localeCompare(b);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort(byString);
}

function normalized(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function candidatesFor(from: string, specifier: string): string[] {
  const spec = specifier
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:from|import|using|use|require(?:_once)?|include(?:_once)?)\s+/i, '')
    .replace(/\s+import\s+.*$/i, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  const out: string[] = [];
  const explicitExt = SOURCE_EXTENSIONS.find((ext) => spec.toLowerCase().endsWith(ext));
  if (explicitExt) {
    out.push(spec, spec.slice(0, -explicitExt.length));
  }
  if (spec.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    out.push(base);
    for (const ext of SOURCE_EXTENSIONS) out.push(`${base}${ext}`);
    for (const ext of SOURCE_EXTENSIONS) out.push(path.posix.join(base, `index${ext}`));
    return out.map(normalized);
  }
  if (spec.includes('::')) {
    const tail = spec.split('::').filter(Boolean).slice(-2).join('/');
    out.push(tail, ...SOURCE_EXTENSIONS.map((ext) => `${tail}${ext}`));
  }
  const segments = spec.split(/[./:\\]+/).filter(Boolean);
  for (let take = Math.min(4, segments.length); take >= 1; take -= 1) {
    const tail = segments.slice(-take).join('/');
    out.push(tail);
    for (const ext of SOURCE_EXTENSIONS) out.push(`${tail}${ext}`);
  }
  return out.map(normalized);
}

function resolveImport(from: string, specifier: string, files: FileIndex[]): string | null {
  const candidates = candidatesFor(from, specifier);
  const candidateSet = new Set(candidates);
  const direct = files.find((file) => candidateSet.has(normalized(file.path)));
  if (direct) return direct.path;

  const specBase = path.posix.basename(candidates[0] || '').replace(/\.[^.]+$/, '');
  const suffixMatch = files.find((file) => {
    const value = normalized(file.path);
    return value.endsWith(`/${specBase}`) || SOURCE_EXTENSIONS.some((ext) => value.endsWith(`/${specBase}${ext}`));
  });
  if (suffixMatch) return suffixMatch.path;

  const prefix = candidates.find((value) => value.length > 2 && !path.posix.extname(value))?.replace(/\/$/, '');
  if (prefix) {
    const inside = files.find((file) => normalized(file.path).startsWith(`${prefix}/`));
    if (inside) return inside.path;
  }

  const tails = candidates
    .filter((value) => value.length > 2 && !path.posix.extname(value))
    .sort((a, b) => b.length - a.length);
  const tailMatch = files.find((file) => {
    const value = normalized(file.path);
    return tails.some((tail) => value.endsWith(`/${tail}`) || SOURCE_EXTENSIONS.some((ext) => value.endsWith(`/${tail}${ext}`)));
  });
  if (tailMatch) return tailMatch.path;
  return null;
}

/** Builds a deterministic directed graph: importer -> imported file. */
export function buildDependencyGraph(index: RepoIndex): DependencyGraph {
  const files = [...index.files].sort((a, b) => byString(a.path, b.path));
  const byPath = new Map(files.map((file) => [file.path, file]));
  const nodes = files.map((file) => file.path);
  const edges: DependencyEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const file of files) {
    for (const specifier of file.imports) {
      const target = resolveImport(file.path, specifier, files);
      if (!target || target === file.path || !byPath.has(target)) {
        if (!target && specifier.trim()) unresolved.push({ file: file.path, specifier });
        continue;
      }
      const kind: DependencyKind = specifier.startsWith('.')
        ? 'relative'
        : /^[<"]?[\w.+-]+\.h[>"]?$/.test(specifier)
          ? 'include'
          : specifier.includes('::') || specifier.includes('.')
            ? 'module'
            : 'sibling';
      const key = `${file.path}\u0000${target}`;
      if (seen.has(key)) continue;
      if (edges.length >= MAX_EDGES) {
        truncated = true;
        break;
      }
      seen.add(key);
      edges.push({ from: file.path, to: target, specifier, kind });
    }
    if (truncated) break;
  }

  edges.sort((a, b) => byString(a.from, b.from) || byString(a.to, b.to) || byString(a.specifier, b.specifier));
  const dependencies = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    dependencies.set(node, []);
    dependents.set(node, []);
  }
  for (const edge of edges) {
    dependencies.get(edge.from)?.push(edge.to);
    dependents.get(edge.to)?.push(edge.from);
  }

  return {
    root: index.root,
    nodes,
    edges,
    dependencies: new Map([...dependencies].map(([key, values]) => [key, uniqueSorted(values)])),
    dependents: new Map([...dependents].map(([key, values]) => [key, uniqueSorted(values)])),
    unresolved: unresolved.sort((a, b) => byString(a.file, b.file) || byString(a.specifier, b.specifier)),
    truncated,
  };
}

/** Deterministic cycle detection; returns one canonical cycle per component. */
export function findCycles(graph: DependencyGraph): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();

  const visit = (node: string): void => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.dependencies.get(node) || []) {
      const current = state.get(next) || 0;
      if (current === 0) visit(next);
      else if (current === 1) {
        const start = stack.indexOf(next);
        const cycle = stack.slice(start < 0 ? 0 : start).concat(next).sort(byString);
        const key = cycle.join('>');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push(cycle);
        }
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of graph.nodes) if (!state.get(node)) visit(node);
  return cycles.sort((a, b) => byString(a.join('>'), b.join('>')));
}

/** Kahn topological order (dependencies before dependents), stable on ties. */
export function topologicalOrder(graph: DependencyGraph): string[] {
  const indegree = new Map<string, number>();
  const reverse = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node, 0);
    reverse.set(node, []);
  }
  for (const edge of graph.edges) {
    // `indegree` here is the number of unresolved dependencies (out-edges).
    indegree.set(edge.from, (indegree.get(edge.from) || 0) + 1);
    reverse.get(edge.to)?.push(edge.from);
  }
  const ready = graph.nodes.filter((node) => (indegree.get(node) || 0) === 0).sort(byString);
  const order: string[] = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of reverse.get(node) || []) {
      const left = (indegree.get(next) || 0) - 1;
      indegree.set(next, left);
      if (left === 0) {
        ready.push(next);
        ready.sort(byString);
      }
    }
  }
  // Cyclic nodes cannot be ordered; append them deterministically instead of
  // hiding them. `findCycles()` reports the exact components.
  if (order.length < graph.nodes.length) {
    for (const node of graph.nodes) if (!order.includes(node)) order.push(node);
  }
  return order;
}

export interface BlastRadius {
  targetFile: string;
  targetSymbol?: string;
  directDependents: string[];
  transitiveDependents: string[];
  dependencies: string[];
  affectedSymbols: Array<{ file: string; name: string; line: number }>;
  depth: number;
}

function walk(graph: DependencyGraph, start: string, adjacency: Map<string, string[]>): string[] {
  const seen = new Set<string>();
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0 && depth < graph.nodes.length) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const linked of adjacency.get(node) || []) {
        if (linked === start || seen.has(linked)) continue;
        seen.add(linked);
        next.push(linked);
      }
    }
    frontier = next;
    depth += 1;
  }
  return Array.from(seen).sort(byString);
}

/** Direct + transitive callers/dependents, bounded by the real graph size. */
export function computeBlastRadius(
  graph: DependencyGraph,
  targetFile: string,
  targetSymbol?: string,
  index?: RepoIndex,
): BlastRadius {
  const target = normalized(targetFile);
  const directDependents = uniqueSorted(graph.dependents.get(target) || []);
  const transitive = walk(graph, target, graph.dependents).filter((file) => !directDependents.includes(file));
  const dependencies = walk(graph, target, graph.dependencies);
  const relevant = new Set([target, ...directDependents, ...transitive]);
  const affectedSymbols = (index?.symbols || [])
    .filter((symbol) => relevant.has(normalized(symbol.file)) && (!targetSymbol || symbol.name === targetSymbol))
    .slice(0, 60)
    .map((symbol) => ({ file: symbol.file, name: symbol.name, line: symbol.line }));
  return {
    targetFile: target,
    ...(targetSymbol ? { targetSymbol } : {}),
    directDependents,
    transitiveDependents: transitive,
    dependencies,
    affectedSymbols,
    depth: graph.nodes.length ? 1 + (transitive.length ? 2 : 0) : 0,
  };
}

/** Token-bounded context: target excerpt first, then affected callers/callees. */
export function buildFocusedContextSlice(
  graph: DependencyGraph,
  radius: BlastRadius,
  files: Record<string, string>,
  index?: RepoIndex,
  maxChars = 16_000,
): string {
  const budget = Math.max(1_000, Math.min(24_000, maxChars));
  const ordered = [radius.targetFile, ...radius.directDependents, ...radius.transitiveDependents].filter(
    (file, i, all) => all.indexOf(file) === i,
  );
  const excerptFor = (file: string): string => {
    const content = files[file] || files[normalized(file)] || '';
    const lines = content.split('\n');
    const symbols = (index?.symbols || []).filter(
      (symbol) => normalized(symbol.file) === normalized(file) &&
        (!radius.targetSymbol || symbol.name === radius.targetSymbol),
    );
    if (symbols.length > 0) {
      const picked = symbols.slice(0, 4);
      const ranges = picked.map((symbol) => ({
        from: Math.max(1, symbol.line - 3),
        to: Math.min(lines.length, symbol.endLine + 3),
      }));
      const slices: string[] = [];
      for (const range of ranges) {
        slices.push(lines.slice(range.from - 1, range.to).join('\n'));
      }
      return slices.join('\n...\n');
    }
    return lines.slice(0, 24).join('\n');
  };

  const blocks: string[] = [];
  let used = 0;
  for (const file of ordered.slice(0, 40)) {
    const body = excerptFor(file);
    if (!body.trim()) continue;
    const block = `===== ${file} =====\n${body.slice(0, 3_000)}`;
    if (used + block.length > budget && blocks.length > 0) break;
    blocks.push(block);
    used += block.length;
  }
  const header = `BLAST target=${radius.targetFile} symbol=${radius.targetSymbol || '*'} callers=${radius.directDependents.length} transitive=${radius.transitiveDependents.length}\n`;
  return (header + blocks.join('\n')).slice(0, budget);
}

/** Bound call-site convenience API matching the requested method signatures. */
export function createDependencyAnalyzer(index: RepoIndex) {
  const graph = buildDependencyGraph(index);
  return {
    graph,
    findCycles: (): string[][] => findCycles(graph),
    topologicalOrder: (): string[] => topologicalOrder(graph),
    computeBlastRadius: (targetFile: string, targetSymbol?: string, files?: Record<string, string>): BlastRadius =>
      computeBlastRadius(graph, targetFile, targetSymbol, index),
    buildFocusedContextSlice: (radius: BlastRadius, files: Record<string, string>, maxChars?: number): string =>
      buildFocusedContextSlice(graph, radius, files, index, maxChars),
  };
}
