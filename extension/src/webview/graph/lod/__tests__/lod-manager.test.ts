/**
 * Unit Tests — LOD System: BudgetManager, OrbitalLayout, LODManager
 * KSA-143
 * Split from lod.test.ts (budget/layout/manager concerns).
 */

import { describe, test, expect } from 'vitest';
import { BudgetManager } from '../BudgetManager';
import { OrbitalLayout } from '../OrbitalLayout';
import { LODManager } from '../LODManager';
import { GraphData, ClusterState, Cluster } from '../types';

function createDenseGroups(groupCount: number, nodesPerGroup: number): GraphData {
  const nodes: GraphData['nodes'] = [];
  const edges: GraphData['edges'] = [];

  for (let g = 0; g < groupCount; g++) {
    for (let n = 0; n < nodesPerGroup; n++) {
      nodes.push({
        id: `g${g}_n${n}`,
        type: `type_${g}`,
        label: `Group ${g} Node ${n}`,
        position: { x: g * 50 + Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 },
      });
    }
    // Dense intra-group edges
    for (let i = 0; i < nodesPerGroup; i++) {
      for (let j = i + 1; j < nodesPerGroup; j++) {
        edges.push({
          id: `e_g${g}_${i}_${j}`,
          source: `g${g}_n${i}`,
          target: `g${g}_n${j}`,
        });
      }
    }
  }

  // Sparse inter-group edges
  for (let g = 0; g < groupCount - 1; g++) {
    edges.push({
      id: `e_inter_${g}`,
      source: `g${g}_n0`,
      target: `g${g + 1}_n0`,
    });
  }

  return { nodes, edges };
}

// ============ BudgetManager Tests ============

describe('BudgetManager', () => {
  test('TC-UT-12: allows expand within budget', () => {
    const mgr = new BudgetManager(100);
    mgr.setCount(60);
    const state: ClusterState = { id: 'c1', state: 'COLLAPSED', cluster: {} as Cluster, childCount: 30, distanceToCamera: 40, lastStateChange: 0 };

    expect(mgr.canExpand(state)).toBe(true);
  });

  test('TC-UT-13: denies expand over budget', () => {
    const mgr = new BudgetManager(100);
    mgr.setCount(80);
    const state: ClusterState = { id: 'c1', state: 'COLLAPSED', cluster: {} as Cluster, childCount: 30, distanceToCamera: 40, lastStateChange: 0 };

    expect(mgr.canExpand(state)).toBe(false);
  });

  test('TC-UT-14: gets farthest expanded cluster', () => {
    const mgr = new BudgetManager(100);
    const clusters = new Map<string, ClusterState>([
      ['c1', { id: 'c1', state: 'EXPANDED', cluster: {} as Cluster, childCount: 10, distanceToCamera: 30, lastStateChange: 0 }],
      ['c2', { id: 'c2', state: 'EXPANDED', cluster: {} as Cluster, childCount: 10, distanceToCamera: 70, lastStateChange: 0 }],
      ['c3', { id: 'c3', state: 'COLLAPSED', cluster: {} as Cluster, childCount: 10, distanceToCamera: 90, lastStateChange: 0 }],
    ]);

    expect(mgr.getFarthestExpanded(clusters)).toBe('c2');
  });
});

// ============ OrbitalLayout Tests ============

describe('OrbitalLayout', () => {
  test('TC-UT-18: single ring for <= 20 nodes', () => {
    const positions = OrbitalLayout.compute(10, { x: 0, y: 0, z: 0 }, 5);

    expect(positions).toHaveLength(10);
    // All positions should be roughly at radius 5 from center
    for (const pos of positions) {
      const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      expect(dist).toBeCloseTo(5, 0);
    }
  });

  test('TC-UT-19: double ring for > 20 nodes', () => {
    const positions = OrbitalLayout.compute(30, { x: 0, y: 0, z: 0 }, 10);

    expect(positions).toHaveLength(30);
  });
});

// ============ LODManager Integration Tests ============

describe('LODManager', () => {
  test('TC-API-01: initialize with valid data', async () => {
    const mgr = new LODManager();
    const graph = createDenseGroups(3, 20);
    const hierarchy = await mgr.initialize(graph);

    expect(hierarchy.clusters.length).toBeGreaterThan(0);
    expect(hierarchy.metadata.totalNodes).toBe(60);
  });

  test('TC-API-02: initialize with empty data', async () => {
    const mgr = new LODManager();
    const hierarchy = await mgr.initialize({ nodes: [], edges: [] });

    expect(hierarchy.clusters).toHaveLength(0);
    expect(hierarchy.isolatedNodes).toHaveLength(0);
  });

  test('TC-API-04: manual expand', async () => {
    const mgr = new LODManager();
    const graph = createDenseGroups(3, 20);
    const hierarchy = await mgr.initialize(graph);

    if (hierarchy.clusters.length > 0) {
      const clusterId = hierarchy.clusters[0].id;
      mgr.expandCluster(clusterId);
      const state = mgr.getClusterState(clusterId);
      expect(state?.state).toBe('EXPANDED');
    }
  });

  test('TC-API-07: event emission on expand', async () => {
    const mgr = new LODManager();
    const graph = createDenseGroups(3, 20);
    const hierarchy = await mgr.initialize(graph);

    let expandedId: string | null = null;
    mgr.on('cluster-expanded', (id: string) => { expandedId = id; });

    if (hierarchy.clusters.length > 0) {
      mgr.expandCluster(hierarchy.clusters[0].id);
      expect(expandedId).toBe(hierarchy.clusters[0].id);
    }
  });

  test('TC-API-08: dispose cleanup', async () => {
    const mgr = new LODManager();
    await mgr.initialize(createDenseGroups(2, 10));
    mgr.dispose();

    expect(mgr.getVisibleNodeCount()).toBe(0);
    expect(mgr.getExpandedClusters()).toHaveLength(0);
  });
});
