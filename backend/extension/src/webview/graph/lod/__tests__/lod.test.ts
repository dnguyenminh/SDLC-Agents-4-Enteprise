/**
 * Unit Tests — LOD System
 * KSA-143
 */

import { describe, test, expect } from 'vitest';
import { ClusteringAlgorithm } from '../ClusteringAlgorithm';
import { DistanceChecker } from '../DistanceChecker';
import { BudgetManager } from '../BudgetManager';
import { OrbitalLayout } from '../OrbitalLayout';
import { LODManager } from '../LODManager';
import { GraphData, ClusterState, Cluster } from '../types';

// Test data generators
function createGraph(nodeCount: number, edgeCount: number, types: string[] = ['class', 'function', 'module']): GraphData {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node_${i}`,
    type: types[i % types.length],
    label: `Node ${i}`,
    position: { x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100 },
  }));

  const edges = Array.from({ length: edgeCount }, (_, i) => ({
    id: `edge_${i}`,
    source: `node_${Math.floor(Math.random() * nodeCount)}`,
    target: `node_${Math.floor(Math.random() * nodeCount)}`,
    type: 'relates',
    weight: 1.0,
  }));

  return { nodes, edges };
}

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

// ============ ClusteringAlgorithm Tests ============

describe('ClusteringAlgorithm', () => {
  const algo = new ClusteringAlgorithm();

  test('TC-UT-01: clusters connected graph into expected groups', () => {
    const graph = createDenseGroups(3, 20);
    const result = algo.cluster(graph, { minClusterSize: 5, maxClusterSize: 50, connectivityWeight: 2, typeWeight: 1 });

    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    expect(result.clusters.length).toBeLessThanOrEqual(10);
    expect(result.metadata.totalNodes).toBe(60);
  });

  test('TC-UT-02: handles empty graph', () => {
    const graph: GraphData = { nodes: [], edges: [] };
    const result = algo.cluster(graph, { minClusterSize: 5, maxClusterSize: 50, connectivityWeight: 2, typeWeight: 1 });

    expect(result.clusters).toHaveLength(0);
    expect(result.isolatedNodes).toHaveLength(0);
  });

  test('TC-UT-03: handles single node', () => {
    const graph: GraphData = { nodes: [{ id: 'n1', type: 'class', label: 'Single' }], edges: [] };
    const result = algo.cluster(graph, { minClusterSize: 5, maxClusterSize: 50, connectivityWeight: 2, typeWeight: 1 });

    // Small graph (< 100 nodes) skips clustering
    expect(result.isolatedNodes).toContain('n1');
  });

  test('TC-UT-04: respects max cluster size', () => {
    const graph = createGraph(200, 1000);
    const result = algo.cluster(graph, { minClusterSize: 5, maxClusterSize: 50, connectivityWeight: 2, typeWeight: 1 });

    for (const cluster of result.clusters) {
      expect(cluster.childNodeIds.length).toBeLessThanOrEqual(50);
    }
  });

  test('TC-UT-05: deterministic output', () => {
    const graph = createDenseGroups(3, 20);
    const options = { minClusterSize: 5, maxClusterSize: 50, connectivityWeight: 2, typeWeight: 1 };

    const result1 = algo.cluster(graph, options);
    const result2 = algo.cluster(graph, options);

    expect(result1.clusters.length).toBe(result2.clusters.length);
    expect(result1.metadata.totalClusters).toBe(result2.metadata.totalClusters);
  });
});

// ============ DistanceChecker Tests ============

describe('DistanceChecker', () => {
  const checker = new DistanceChecker(50, 70);

  function makeClusterState(id: string, state: ClusterState['state'], center = { x: 0, y: 0, z: 0 }): [string, ClusterState] {
    return [id, {
      id,
      state,
      cluster: { id, label: id, childNodeIds: [], center, radius: 5, dominantType: 'class' },
      childCount: 10,
      distanceToCamera: 0,
      lastStateChange: Date.now(),
    }];
  }

  test('TC-UT-07: triggers expand when distance < threshold', () => {
    const clusters = new Map([makeClusterState('c1', 'COLLAPSED')]);
    const events = checker.evaluate({ x: 30, y: 0, z: 0 }, clusters); // distance = 30 < 50

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'EXPAND', clusterId: 'c1' });
  });

  test('TC-UT-08: no trigger in hysteresis zone', () => {
    const clusters = new Map([makeClusterState('c1', 'EXPANDED')]);
    const events = checker.evaluate({ x: 60, y: 0, z: 0 }, clusters); // 50 < 60 < 70

    expect(events).toHaveLength(0);
  });

  test('TC-UT-09: triggers collapse when distance > collapse threshold', () => {
    const clusters = new Map([makeClusterState('c1', 'EXPANDED')]);
    const events = checker.evaluate({ x: 80, y: 0, z: 0 }, clusters); // 80 > 70

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'COLLAPSE', clusterId: 'c1' });
  });
});

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
