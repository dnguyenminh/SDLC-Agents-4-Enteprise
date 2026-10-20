/**
 * LOD Manager — Orchestrates Level of Detail for 3D KB Graph (core class, ES module)
 * KSA-143: KB Graph Level of Detail / Semantic Zoom
 *
 * Integrates clustering + animation with ForceGraph3D.
 * Manages camera distance checks, budget enforcement, state machine.
 *
 * Module split (BR-18 ≤200 lines/file):
 *   - lod-manager/lod-manager-core.js    (this file — class core)
 *   - lod-manager/lod-manager-runtime.js (private runtime methods, prototype patch)
 *   - ../lod-manager.js                  (entry — re-export + side-effect patch import)
 */
import { LODClustering } from '../lod-clustering.js';
import { LODAnimation } from '../lod-animation.js';

const COLORS = {
  CONTEXT: '#38bdf8', DECISION: '#f472b6', ERROR_PATTERN: '#fb923c',
  ARCHITECTURE: '#a78bfa', REQUIREMENT: '#34d399', PROCEDURE: '#facc15',
  LESSON_LEARNED: '#f87171', CODE_ENTITY: '#e2e8f0', API_DESIGN: '#2dd4bf',
};

export class LODManager {
  constructor(graph3dInstance, config = {}) {
    this._graph = graph3dInstance;
    this._config = {
      expandThreshold: config.expandThreshold || 50,
      collapseThreshold: config.collapseThreshold || (config.expandThreshold || 50) * 1.4,
      animationDuration: config.animationDuration || 400,
      maxVisibleNodes: config.maxVisibleNodes || 100,
      minClusterSize: config.minClusterSize || 5,
      maxClusterSize: config.maxClusterSize || 50,
      lodEnabled: config.lodEnabled !== false
    };

    this._clustering = new LODClustering({
      minClusterSize: this._config.minClusterSize,
      maxClusterSize: this._config.maxClusterSize
    });
    this._animation = new LODAnimation(graph3dInstance);

    this._clusters = new Map();
    this._allNodes = [];
    this._allEdges = [];
    this._visibleNodes = new Set();
    this._rafId = null;
    this._initialized = false;
  }

  initialize(nodes, edges) {
    this._allNodes = nodes;
    this._allEdges = edges;
    if (nodes.length <= this._config.maxVisibleNodes) { this._initialized = false; return; }
    if (!this._config.lodEnabled) { this._initialized = false; return; }

    const startTime = performance.now();
    const clusters = this._clustering.compute(nodes, edges);
    const elapsed = performance.now() - startTime;
    console.log(`[LOD] Clustering: ${clusters.length} clusters from ${nodes.length} nodes in ${elapsed.toFixed(0)}ms`);
    if (elapsed > 5000) console.warn('[LOD] Clustering took', elapsed, 'ms');

    for (const cluster of clusters) this._clusters.set(cluster.id, cluster);
    this._showSuperNodes();
    this._initialized = true;
    this._startTick();
    console.log(`[LOD] Initialized: ${clusters.length} clusters from ${nodes.length} nodes (${elapsed.toFixed(0)}ms)`);
  }

  expandCluster(clusterId) {
    const cluster = this._clusters.get(clusterId);
    if (!cluster || cluster.state !== 'COLLAPSED') return false;
    if (!this._budgetAllows(cluster)) {
      if (!this._freeBudget(cluster.childNodeIds.length)) return false;
    }
    cluster.state = 'EXPANDING';
    const childNodes = this._getChildNodes(cluster);
    for (const node of childNodes) {
      node.__lodCenterX = cluster.center.x;
      node.__lodCenterY = cluster.center.y;
      node.__lodCenterZ = cluster.center.z;
    }
    this._animation.expand(cluster, childNodes, {
      duration: this._config.animationDuration,
      onComplete: () => {
        cluster.state = 'EXPANDED';
        for (const id of cluster.childNodeIds) this._visibleNodes.add(id);
        this._visibleNodes.delete(cluster.id);
        this._updateGraphData();
      }
    });
    return true;
  }

  collapseCluster(clusterId) {
    const cluster = this._clusters.get(clusterId);
    if (!cluster || cluster.state !== 'EXPANDED') return false;
    if (cluster.interacting) return false;
    cluster.state = 'COLLAPSING';
    const childNodes = this._getChildNodes(cluster);
    this._animation.collapse(cluster, childNodes, {
      duration: this._config.animationDuration,
      onComplete: () => {
        cluster.state = 'COLLAPSED';
        for (const id of cluster.childNodeIds) this._visibleNodes.delete(id);
        this._visibleNodes.add(cluster.id);
        this._updateGraphData();
      }
    });
    return true;
  }

  getVisibleNodeCount() { return this._visibleNodes.size; }

  setConfig(config) {
    Object.assign(this._config, config);
    if (config.expandThreshold && !config.collapseThreshold) {
      this._config.collapseThreshold = this._config.expandThreshold * 1.4;
    }
    if (config.lodEnabled === false) this._disableLOD();
    else if (config.lodEnabled === true && !this._initialized) this.initialize(this._allNodes, this._allEdges);
  }

  dispose() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._animation.dispose();
    this._clusters.clear();
    this._visibleNodes.clear();
    this._initialized = false;
  }
}
