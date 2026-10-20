/**
 * LODManager — KSA-291: _checkDistances (fixed) unit tests.
 * (BR-18 split from lod-manager.test.js; excluded from vitest by config —
 * the include covers *.test.ts only. Run via `node --test` follow-up.)
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockGraph, createCluster, TestableLODManager } from './lod-manager.helpers.js';

describe('LODManager — KSA-291 Bug Fix', () => {
  describe('_checkDistances (fixed)', () => {
    it('UT-5: EXPANDED cluster uses dynamic centroid — collapse triggers', () => {
      const graph = createMockGraph({ x: 0, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph, { expandThreshold: 50 });

      mgr._allNodes = [
        { id: 'n1', x: 80, y: 0, z: 0 },
        { id: 'n2', x: 100, y: 0, z: 0 },
      ];
      const cluster = createCluster('c1', { x: 10, y: 0, z: 0 }, ['n1', 'n2'], 'EXPANDED');
      mgr._clusters.set('c1', cluster);

      mgr._checkDistances();

      // centroid = (90, 0, 0), dist = 90 > 70 (collapseThreshold) -> collapse triggered
      expect(mgr.collapseCluster).toHaveBeenCalledWith('c1');
    });

    it('UT-6: COLLAPSED cluster still uses cluster.center for expand', () => {
      const graph = createMockGraph({ x: 12, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph, { expandThreshold: 50 });

      mgr._allNodes = [{ id: 'n1', x: 200, y: 0, z: 0 }];
      const cluster = createCluster('c1', { x: 10, y: 0, z: 0 }, ['n1'], 'COLLAPSED');
      mgr._clusters.set('c1', cluster);
      mgr._visibleNodes = new Set(['c1']);

      mgr._checkDistances();

      // dist to cluster.center = 2 < 50 -> expand triggered
      expect(mgr.expandCluster).toHaveBeenCalledWith('c1');
    });

    it('UT-7: skips animating clusters', () => {
      const graph = createMockGraph({ x: 0, y: 0, z: 0 });
      const mgr = new TestableLODManager(graph);

      const cluster = createCluster('c1', { x: 10, y: 0, z: 0 }, ['n1'], 'EXPANDING');
      mgr._clusters.set('c1', cluster);
      mgr._animation.isAnimating.mockReturnValue(true);

      mgr._checkDistances();

      expect(mgr.expandCluster).not.toHaveBeenCalled();
      expect(mgr.collapseCluster).not.toHaveBeenCalled();
    });
  });
});
