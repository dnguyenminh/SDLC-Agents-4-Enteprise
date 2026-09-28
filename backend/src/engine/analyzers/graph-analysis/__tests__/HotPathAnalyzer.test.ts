/**
 * KSA-163 — Unit tests for HotPathAnalyzer transitive caller counting.
 */

import { describe, it, expect, vi } from 'vitest';
import { HotPathAnalyzer } from '../HotPathAnalyzer.js';
import type { GraphLoader } from '../utils/GraphLoader.js';
import type { SymbolInfo } from '../utils/GraphLoader.js';
import type { AdjacencyList } from '../types.js';

const BASE_GRAPH: AdjacencyList = new Map([
  [10, [1, 2, 3]],
  [1, [4]],
  [2, [5]],
  [5, [6]],
  [3, []],
  [4, []],
  [6, []],
]);

function loaderFor(graph: AdjacencyList, infos: Map<number, SymbolInfo>): GraphLoader {
  return {
    loadReverseCallGraph: vi.fn(() => graph),
    getSymbolInfo: vi.fn((id: number) => infos.get(id) ?? null),
  } as unknown as GraphLoader;
}

const HOT_INFO = new Map<number, SymbolInfo>([[10, { id: 10, name: 'hot', kind: 'function', filePath: 'hot.ts' }]]);

describe('HotPathAnalyzer', () => {
  it('counts direct and transitive callers via BFS', async () => {
    const detector = new HotPathAnalyzer(loaderFor(BASE_GRAPH, HOT_INFO));
    const result = await detector.analyze();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ symbolId: 10, symbolName: 'hot', directCallers: 3, transitiveCallers: 6 });
  });

  it('passes the module filter to the loader', async () => {
    const loader = loaderFor(BASE_GRAPH, HOT_INFO);
    const detector = new HotPathAnalyzer(loader);
    await detector.analyze({ module: 'modA' });
    expect(loader.loadReverseCallGraph).toHaveBeenCalledWith('modA');
  });

  it('respects the minCallers threshold', async () => {
    const detector = new HotPathAnalyzer(loaderFor(BASE_GRAPH, HOT_INFO));
    expect(await detector.analyze({ minCallers: 4 })).toEqual([]);
  });

  it('respects the limit option', async () => {
    const detector = new HotPathAnalyzer(loaderFor(BASE_GRAPH, HOT_INFO));
    expect(await detector.analyze({ limit: 0 })).toEqual([]);
  });

  it('skips symbols whose info cannot be resolved', async () => {
    const graph: AdjacencyList = new Map([
      [30, [8, 9]],
      [8, []],
      [9, []],
    ]);
    const detector = new HotPathAnalyzer(loaderFor(graph, HOT_INFO));
    expect(await detector.analyze()).toEqual([]);
  });

  it('sorts by transitive callers descending', async () => {
    const graph: AdjacencyList = new Map([
      [10, [1, 2, 3]],
      [1, [4]],
      [2, [5]],
      [5, [6]],
      [3, []],
      [4, []],
      [6, []],
      [40, [8, 9, 11]],
      [8, []],
      [9, []],
      [11, []],
    ]);
    const infos = new Map<number, SymbolInfo>(HOT_INFO);
    infos.set(40, { id: 40, name: 'runner', kind: 'function', filePath: 'runner.ts' });
    const result = await new HotPathAnalyzer(loaderFor(graph, infos)).analyze();
    expect(result.map(r => r.symbolId)).toEqual([10, 40]);
  });
});