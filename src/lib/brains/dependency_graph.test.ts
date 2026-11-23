import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDependencyGraph,
  buildFocusedContextSlice,
  computeBlastRadius,
  createDependencyAnalyzer,
  findCycles,
  topologicalOrder,
} from './dependency_graph';
import type { FileIndex, RepoIndex, SymbolRecord } from './repo_indexer';

function file(pathName: string, language: string, imports: string[], symbolNames: string[] = []): FileIndex {
  const symbols: SymbolRecord[] = symbolNames.map((name, index) => ({
    kind: 'function',
    name,
    file: pathName,
    line: index * 10 + 1,
    endLine: index * 10 + 8,
  }));
  return { path: pathName, bytes: 200, lines: 40, language, imports, symbols };
}

function fixture(): RepoIndex {
  const files = [
    file('a.ts', 'typescript', ['./b'], ['runA']),
    file('b.ts', 'typescript', ['./a'], ['runB']),
    file('c.ts', 'typescript', ['./a'], ['runC']),
    file('d.ts', 'typescript', ['./c'], ['runD']),
    file('pkg/helper.py', 'python', [], ['compute']),
    file('app.py', 'python', ['from pkg import helper'], ['main']),
    file('src/com/acme/Service.java', 'java', [], ['serve']),
    file('src/com/acme/App.java', 'java', ['import com.acme.Service'], ['start']),
    file('include/math.h', 'c', [], ['add']),
    file('src/main.c', 'c', ['"math.h"'], ['main_c']),
  ];
  return {
    root: '/fixture',
    files,
    symbols: files.flatMap((entry) => entry.symbols),
    truncated: false,
    warnings: [],
  };
}

test('graph resolves relative, module, java and C include imports across languages', () => {
  const graph = buildDependencyGraph(fixture());
  const edge = (from: string, to: string) => graph.edges.some((item) => item.from === from && item.to === to);
  assert.equal(edge('a.ts', 'b.ts'), true);
  assert.equal(edge('b.ts', 'a.ts'), true);
  assert.equal(edge('c.ts', 'a.ts'), true);
  assert.equal(edge('d.ts', 'c.ts'), true);
  assert.equal(edge('app.py', 'pkg/helper.py'), true);
  assert.equal(edge('src/com/acme/App.java', 'src/com/acme/Service.java'), true);
  assert.equal(edge('src/main.c', 'include/math.h'), true);
  assert.equal(graph.nodes.length, 10);
});

test('cycle detection is deterministic and topological order keeps dependencies first', () => {
  const graph = buildDependencyGraph(fixture());
  const cycles = findCycles(graph);
  assert.ok(cycles.some((cycle) => cycle.includes('a.ts') && cycle.includes('b.ts')));

  const acyclic = buildDependencyGraph({
    root: '/acyclic',
    files: [
      file('base.ts', 'typescript', [], ['base']),
      file('mid.ts', 'typescript', ['./base'], ['mid']),
      file('top.ts', 'typescript', ['./mid'], ['top']),
    ],
    symbols: [],
    truncated: false,
    warnings: [],
  });
  const order = topologicalOrder(acyclic);
  assert.equal(order.length, 3);
  assert.equal(new Set(order).size, 3);
  assert.ok(order.indexOf('base.ts') < order.indexOf('mid.ts'));
  assert.ok(order.indexOf('mid.ts') < order.indexOf('top.ts'));
});

test('blast radius returns direct and transitive dependents plus affected symbols', () => {
  const index = fixture();
  const analyzer = createDependencyAnalyzer(index);
  const files: Record<string, string> = {
    'a.ts': 'export function runA() { return 1; }\n',
    'b.ts': 'import { runA } from "./a";\nexport function runB() { return runA(); }\n',
    'c.ts': 'import { runA } from "./a";\nexport function runC() { return runA(); }\n',
    'd.ts': 'import { runC } from "./c";\nexport function runD() { return runC(); }\n',
  };
  const radius = analyzer.computeBlastRadius('a.ts', 'runA', files);
  assert.deepEqual(radius.directDependents, ['b.ts', 'c.ts']);
  assert.deepEqual(radius.transitiveDependents, ['d.ts']);
  assert.ok(radius.affectedSymbols.some((symbol) => symbol.file === 'a.ts' && symbol.name === 'runA'));

  const slice = analyzer.buildFocusedContextSlice(radius, files, 1_200);
  assert.ok(slice.includes('BLAST target=a.ts'));
  assert.ok(slice.includes('===== a.ts ====='));
  assert.ok(slice.includes('===== d.ts ====='));
  assert.ok(slice.length <= 1_200);
});

test('focused slicing is token-budgeted and never emits unrelated files first', () => {
  const index = fixture();
  const graph = buildDependencyGraph(index);
  const radius = computeBlastRadius(graph, 'a.ts');
  const files = Object.fromEntries(index.files.map((entry) => [entry.path, `${entry.path}\n`.repeat(300)]));
  const slice = buildFocusedContextSlice(graph, radius, files, index, 3_000);
  assert.ok(slice.length <= 3_000);
  assert.ok(slice.indexOf('===== a.ts =====') < slice.indexOf('===== b.ts ====='));
});
