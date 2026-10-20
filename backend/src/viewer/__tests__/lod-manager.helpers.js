/**
 * Shared test helpers for LODManager tests — KSA-291 Bug Fix.
 * (BR-18 split from lod-manager.test.js; the .test.js suite is excluded from
 * vitest by config — include covers *.test.ts only. Kept for `node --test`.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

export function createMockGraph(cameraPosition = { x: 0, y: 0, z: 0 }) {
  return {
    camera: () => ({ position: cameraPosition }),
    graphData: vi.fn(),
    nodeVal: vi.fn(),
    nodeColor: vi.fn(),
    nodeLabel: vi.fn(),
  };
}

export function createMockAnimation() {
  return {
    isAnimating: vi.fn().mockReturnValue(false),
    expand: vi.fn(),
    collapse: vi.fn(),
    dispose: vi.fn(),
  };
}

export function createCluster(id, center, childNodeIds, state = 'COLLAPSED') {
  return {
    id,
    label: `Cluster ${id}`,
    center,
    childNodeIds,
    state,
    interacting: false,
    dominantType: 'ARCHITECTURE',
    radius: 25,
  };
}

// Since LODManager is a class with private methods, we test via a minimal instance
// that exposes internals for testing purposes.

export class TestableLODManager {
  constructor(graph, config = {}) {
    this._graph = graph;
    this._config = {
      expandThreshold: config.expandThreshold || 50,
      collapseThreshold: config.collapseThreshold || (config.expandThreshold || 50) * 1.4,
      animationDuration: config.animationDuration || 400,
      maxVisibleNodes: config.maxVisibleNodes || 100,
    };
    this._clusters = new Map();
    this._allNodes = [];
    this._allEdges = [];
    this._visibleNodes = new Set();
    this._animation = createMockAnimation();
    this._initialized = true;
  }

  _getExpandedCentroid(cluster) {
    const childNodes = this._getChildNodes(cluster);
    if (childNodes.length === 0) return cluster.center;
    let sumX = 0, sumY = 0, sumZ = 0;
    const len = childNodes.length;
    for (let i = 0; i < len; i++) {
      sumX += childNodes[i].x || 0;
      sumY += childNodes[i].y || 0;
      sumZ += childNodes[i].z || 0;
    }
    return { x: sumX / len, y: sumY / len, z: sumZ / len };
  }

  _checkDistances() {
    const cam = this._graph.camera().position;
    for (const [id, cluster] of this._clusters) {
      if (this._animation.isAnimating(id)) continue;

      if (cluster.state === 'COLLAPSED') {
        const dist = this._distance(cam, cluster.center);
        if (dist < this._config.expandThreshold) {
          if (this._budgetAllows(cluster)) this.expandCluster(id);
        }
      } else if (cluster.state === 'EXPANDED') {
        const centroid = this._getExpandedCentroid(cluster);
        const dist = this._distance(cam, centroid);
        if (dist > this._config.collapseThreshold) {
          if (!cluster.interacting) this.collapseCluster(id);
        }
      }
    }
  }

  _freeBudget(needed) {
    const cam = this._graph.camera().position;
    const expanded = Array.from(this._clusters.values())
      .filter(c => c.state === 'EXPANDED' && !c.interacting)
      .sort((a, b) => {
        const distA = this._distance(cam, this._getExpandedCentroid(a));
        const distB = this._distance(cam, this._getExpandedCentroid(b));
        return distB - distA;
      });
    for (const cluster of expanded) {
      this.collapseCluster(cluster.id);
      if (this._visibleNodes.size - 1 + needed <= this._config.maxVisibleNodes) return true;
    }
    return false;
  }

  _budgetAllows(cluster) {
    return (this._visibleNodes.size - 1 + cluster.childNodeIds.length) <= this._config.maxVisibleNodes;
  }

  _getChildNodes(cluster) {
    const nodeMap = new Map(this._allNodes.map(n => [n.id, n]));
    return cluster.childNodeIds.map(id => nodeMap.get(id)).filter(Boolean);
  }

  _distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  expandCluster = vi.fn().mockReturnValue(true);
  collapseCluster = vi.fn().mockReturnValue(true);
}
