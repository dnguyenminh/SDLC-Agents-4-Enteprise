/**
 * LODManager — KSA-291: _freeBudget (fixed) + integration tests.
 * (BR-18 split from lod-manager.test.js; excluded from vitest by config —
 * the include covers *.test.ts only. Run via `node --test` follow-up.)
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockGraph, createCluster, TestableLODManager } from './lod-manager.helpers.js';

describe('LODManager — KSA-291 Bug Fix', () => {
  describe('_freeBudget (fixed)', () => {
    it('UT-8: sorts by dynamic centroid, collapses farthest first', () => {
      const graph = createMockGraph({ x: 0, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph, { maxVisibleNodes: 50 });

      mgr._allNodes = [
        { id: 'a1', x: 10, y: 0, z: 0 },
        { id: 'b1', x: 50, y: 0, z: 0 },
        { id: 'c1', x: 200, y: 0, z: 0 },
      ];
      const clusterA = createCluster('cA', { x: 5, y: 0, z: 0 }, ['a1'], 'EXPANDED');
      const clusterB = createCluster('cB', { x: 5, y: 0, z: 0 }, ['b1'], 'EXPANDED');
      const clusterC = createCluster('cC', { x: 5, y: 0, z: 0 }, ['c1'], 'EXPANDED');

      mgr._clusters.set('cA', clusterA);
      mgr._clusters.set('cB', clusterB);
      mgr._clusters.set('cC', clusterC);

      mgr._visibleNodes = new Set(Array.from({ length: 60 }, (_, i) => `node-${i}`));

      mgr._freeBudget(10);

      // clusterC (centroid x=200) should be collapsed first (farthest)
      expect(mgr.collapseCluster).toHaveBeenCalledWith('cC');
      expect(mgr.collapseCluster.mock.calls[0][0]).toBe('cC');
    });
  });

  describe('Integration: Expand -> Drift -> Collapse', () => {
    it('IT-1: collapse triggers after child nodes drift away', () => {
      const graph = createMockGraph({ x: 0, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph, { expandThreshold: 50 });

      const childIds = Array.from({ length: 10 }, (_, i) => `n${i}`);
      mgr._allNodes = childIds.map((id, i) => ({
        id,
        x: 150 + i * 5,
        y: 0,
        z: 0,
      }));

      const cluster = createCluster('c1', { x: 10, y: 0, z: 0 }, childIds, 'EXPANDED');
      mgr._clusters.set('c1', cluster);

      mgr._checkDistances();

      // Dynamic centroid ~ (172.5, 0, 0), dist ~ 172.5 > 70 -> collapse
      expect(mgr.collapseCluster).toHaveBeenCalledWith('c1');
    });

    it('IT-3: expand regression — collapsed cluster uses fixed center', () => {
      const graph = createMockGraph({ x: 48, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph, { expandThreshold: 50 });

      mgr._allNodes = [{ id: 'n1', x: 500, y: 0, z: 0 }];
      const cluster = createCluster('c1', { x: 50, y: 0, z: 0 }, ['n1'], 'COLLAPSED');
      mgr._clusters.set('c1', cluster);
      mgr._visibleNodes = new Set(['c1']);

      mgr._checkDistances();

      // dist to cluster.center = 2 < 50 -> expand triggered (not child pos 500)
      expect(mgr.expandCluster).toHaveBeenCalledWith('c1');
    });
  });
});
