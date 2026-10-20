/**
 * LODManager — KSA-291: _getExpandedCentroid unit tests.
 * (BR-18 split from lod-manager.test.js; excluded from vitest by config —
 * the include covers *.test.ts only. Run via `node --test` follow-up.)
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockGraph, createCluster, TestableLODManager } from './lod-manager.helpers.js';

describe('LODManager — KSA-291 Bug Fix', () => {
  describe('_getExpandedCentroid', () => {
    it('UT-1: returns correct average for 3 nodes', () => {
      const graph = createMockGraph();
      const mgr = new TestableLODManager(graph);
      mgr._allNodes = [
        { id: 'n1', x: 0, y: 0, z: 0 },
        { id: 'n2', x: 10, y: 0, z: 0 },
        { id: 'n3', x: 20, y: 0, z: 0 },
      ];
      const cluster = createCluster('c1', { x: 5, y: 0, z: 0 }, ['n1', 'n2', 'n3'], 'EXPANDED');

      const centroid = mgr._getExpandedCentroid(cluster);

      expect(centroid).toEqual({ x: 10, y: 0, z: 0 });
    });

    it('UT-2: returns cluster.center when no children found', () => {
      const graph = createMockGraph();
      const mgr = new TestableLODManager(graph);
      mgr._allNodes = [];
      const cluster = createCluster('c1', { x: 5, y: 5, z: 5 }, ['nonexistent'], 'EXPANDED');

      const centroid = mgr._getExpandedCentroid(cluster);

      expect(centroid).toEqual({ x: 5, y: 5, z: 5 });
    });

    it('UT-3: handles undefined node positions (treats as 0)', () => {
      const graph = createMockGraph();
      const mgr = new TestableLODManager(graph);
      mgr._allNodes = [
        { id: 'n1', x: 10, y: undefined, z: 5 },
        { id: 'n2', x: 20, y: 10, z: undefined },
      ];
      const cluster = createCluster('c1', { x: 0, y: 0, z: 0 }, ['n1', 'n2'], 'EXPANDED');

      const centroid = mgr._getExpandedCentroid(cluster);

      expect(centroid.x).toBeCloseTo(15);
      expect(centroid.y).toBeCloseTo(5);
      expect(centroid.z).toBeCloseTo(2.5);
    });

    it('UT-4: single node returns that node position', () => {
      const graph = createMockGraph();
      const mgr = new TestableLODManager(graph);
      mgr._allNodes = [{ id: 'n1', x: 5, y: 10, z: 15 }];
      const cluster = createCluster('c1', { x: 0, y: 0, z: 0 }, ['n1'], 'EXPANDED');

      const centroid = mgr._getExpandedCentroid(cluster);

      expect(centroid).toEqual({ x: 5, y: 10, z: 15 });
    });
  });
});
