/**
 * KSA-163 — Unit tests for RelatedTestFinder reverse call-graph BFS.
 */

import { describe, it, expect, vi } from 'vitest';
import { RelatedTestFinder } from '../RelatedTestFinder.js';
import type { GraphLoader } from '../utils/GraphLoader.js';
import type { SymbolInfo } from '../utils/GraphLoader.js';
import type { AdjacencyList } from '../types.js';

const INFOS = new Map<number, SymbolInfo>([
  [1, { id: 1, name: 'doThing', kind: 'function', filePath: 'src/a.ts' }],
  [2, { id: 2, name: 'testA', kind: 'function', filePath: 'tests/a.test.ts' }],
  [3, { id: 3, name: 'middle', kind: 'function', filePath: 'src/m.ts' }],
  [4, { id: 4, name: 'testIndirect', kind: 'function', filePath: 'specs/b.spec.ts' }],
  [5, { id: 5, name: 'deepTest', kind: 'function', filePath: 'deep.spec.ts' }],
]);

const REVERSE: AdjacencyList = new Map([
  [1, [2, 3]],
  [2, [4]],
  [3, []],
  [4, []],
]);

const DEEP_REVERSE: AdjacencyList = new Map([
  [1, [2, 3]],
  [2, [4]],
  [3, []],
  [4, [5]],
  [5, []],
]);

function loaderFor(reverse: AdjacencyList, resolve: (name: string, fp?: string) => number | null): GraphLoader {
  return {
    resolveSymbolId: vi.fn(resolve),
    getSymbolInfo: vi.fn((id: number) => INFOS.get(id) ?? null),
    loadReverseCallGraph: vi.fn(() => reverse),
  } as unknown as GraphLoader;
}

const DEFAULT_RESOLVE = (name: string): number | null => (name === 'doThing' ? 1 : null);

describe('RelatedTestFinder', () => {
  it('finds direct and indirect tests via reverse BFS', async () => {
    const finder = new RelatedTestFinder(loaderFor(REVERSE, DEFAULT_RESOLVE));
    const result = await finder.find('doThing');

    expect(result).not.toBeNull();
    expect(result!.symbol).toEqual({ id: 1, name: 'doThing', filePath: 'src/a.ts' });
    expect(result!.totalTests).toBe(2);
    expect(result!.directTests).toHaveLength(1);
    expect(result!.directTests[0]).toMatchObject({ symbolId: 2, testName: 'testA', depth: 1 });
    expect(result!.directTests[0].path).toEqual(['testA', 'doThing']);
    expect(result!.indirectTests).toHaveLength(1);
    expect(result!.indirectTests[0]).toMatchObject({ symbolId: 4, testName: 'testIndirect', depth: 2 });
    expect(result!.indirectTests[0].path).toEqual(['testIndirect', 'doThing', 'testA']);
  });

  it('honors the filePath resolver option', async () => {
    const loader = loaderFor(REVERSE, DEFAULT_RESOLVE);
    const finder = new RelatedTestFinder(loader);
    await finder.find('doThing', { filePath: 'src/' });
    expect(loader.resolveSymbolId).toHaveBeenCalledWith('doThing', 'src/');
  });

  it('limits BFS expansion depth with maxDepth', async () => {
    const finder = new RelatedTestFinder(loaderFor(DEEP_REVERSE, DEFAULT_RESOLVE));
    const result = await finder.find('doThing', { maxDepth: 1 });
    expect(result!.directTests).toHaveLength(1);
    expect(result!.indirectTests.map(t => t.symbolId)).toEqual([4]);
    expect(result!.indirectTests.some(t => t.symbolId === 5)).toBe(false);
    expect(result!.totalTests).toBe(2);
  });

  it('finds deeper indirect tests with default depth', async () => {
    const finder = new RelatedTestFinder(loaderFor(DEEP_REVERSE, DEFAULT_RESOLVE));
    const result = await finder.find('doThing');
    expect(result!.indirectTests.map(t => t.symbolId).sort()).toEqual([4, 5]);
    expect(result!.totalTests).toBe(3);
  });

  it('returns null when the symbol cannot be resolved', async () => {
    const finder = new RelatedTestFinder(loaderFor(REVERSE, () => null));
    expect(await finder.find('ghost')).toBeNull();
  });

  it('returns null when the resolved symbol has no info', async () => {
    const finder = new RelatedTestFinder(loaderFor(REVERSE, (name) => (name === 'ghost' ? 99 : null)));
    expect(await finder.find('ghost')).toBeNull();
  });

  it('returns zero tests when nothing matches', async () => {
    const finder = new RelatedTestFinder(loaderFor(new Map([[1, [3]], [3, []]]), DEFAULT_RESOLVE));
    const result = await finder.find('doThing');
    expect(result!.directTests).toEqual([]);
    expect(result!.indirectTests).toEqual([]);
    expect(result!.totalTests).toBe(0);
  });
});