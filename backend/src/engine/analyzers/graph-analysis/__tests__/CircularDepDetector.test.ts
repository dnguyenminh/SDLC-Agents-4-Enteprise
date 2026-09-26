/**
 * KSA-163 — Unit tests for CircularDepDetector severity and cycle-chain building.
 */

import { describe, it, expect, vi } from 'vitest';
import { CircularDepDetector } from '../CircularDepDetector.js';
import type { GraphLoader } from '../utils/GraphLoader.js';
import type { SymbolInfo } from '../utils/GraphLoader.js';
import type { AdjacencyList } from '../types.js';

function loaderFor(graph: AdjacencyList): GraphLoader {
  const info = (id: number): SymbolInfo => ({
    id, name: `sym${id}`, kind: 'function', filePath: `src/f${id}.ts`,
  });
  return {
    loadDependencyGraph: vi.fn(() => graph),
    getSymbolInfoBatch: vi.fn((ids: number[]) => {
      const m = new Map<number, SymbolInfo>();
      for (const id of ids) m.set(id, info(id));
      return m;
    }),
  } as unknown as GraphLoader;
}

describe('CircularDepDetector', () => {
  it('detects a two-node cycle with high severity', async () => {
    const graph: AdjacencyList = new Map([[1, [2]], [2, [1]]]);
    const detector = new CircularDepDetector(loaderFor(graph));
    const result = await detector.detect();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ length: 2, severity: 'high', module: undefined });
    expect(result[0].cycle.nodes.map(n => n.name).sort()).toEqual(['sym1', 'sym2']);
    expect(result[0].cycle.nodes.map(n => n.symbolId).sort()).toEqual([1, 2]);
    expect(result[0].cycle.edges.slice().sort()).toEqual(['sym1 → sym2', 'sym2 → sym1']);
  });

  it('passes the module filter to the loader', async () => {
    const graph: AdjacencyList = new Map([[1, [2]], [2, [1]]]);
    const loader = loaderFor(graph);
    const detector = new CircularDepDetector(loader);
    await detector.detect({ module: 'modA' });
    expect(loader.loadDependencyGraph).toHaveBeenCalledWith('modA');
  });

  it('returns empty for an empty graph', async () => {
    const detector = new CircularDepDetector(loaderFor(new Map()));
    expect(await detector.detect()).toEqual([]);
  });

  it('filters cycles by maxLength', async () => {
    const graph: AdjacencyList = new Map([[1, [2]], [2, [1]]]);
    const detector = new CircularDepDetector(loaderFor(graph));
    expect(await detector.detect({ maxLength: 1 })).toEqual([]);
  });

  it('classifies three-node cycles as medium', async () => {
    const graph: AdjacencyList = new Map([[1, [2]], [2, [3]], [3, [1]]]);
    const result = await new CircularDepDetector(loaderFor(graph)).detect();
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('medium');
  });

  it('classifies five-node cycles as low', async () => {
    const graph: AdjacencyList = new Map([
      [1, [2]], [2, [3]], [3, [4]], [4, [5]], [5, [1]],
    ]);
    const result = await new CircularDepDetector(loaderFor(graph)).detect();
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('low');
  });

  it('sorts results by severity high first then length', async () => {
    const graph: AdjacencyList = new Map([
      [1, [2]], [2, [3]], [3, [1]], [4, [5]], [5, [4]],
    ]);
    const result = await new CircularDepDetector(loaderFor(graph)).detect();
    expect(result.map(r => r.length)).toEqual([2, 3]);
    expect(result.map(r => r.severity)).toEqual(['high', 'medium']);
  });
});