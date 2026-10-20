/**
 * LOD Manager — Orchestrates Level of Detail for 3D KB Graph (core class)
 * KSA-143: KB Graph Level of Detail / Semantic Zoom
 *
 * Integrates clustering + animation with ForceGraph3D.
 * Manages camera distance checks, budget enforcement, state machine.
 *
 * Load order (classic <script> tags, see admin/index.html):
 *   1. lod-clustering/lod-clustering-core.js     (+ -clusters.js)
 *   2. lod-animation.js
 *   3. lod-manager/lod-manager-core.js           (this file — class + window export)
 *   4. lod-manager/lod-manager-runtime.js        (private runtime methods, prototype patch)
 * LODClustering/LODAnimation are consumed in the constructor at runtime, so
 * they only need to be defined before the first LODManager is instantiated.
 */

// LODClustering and LODAnimation loaded via separate <script> tags (global)

const COLORS = {
  // Document types
  CONTEXT: '#ec4899', DECISION: '#06b6d4', ERROR_PATTERN: '#dc2626',
  ARCHITECTURE: '#10b981', REQUIREMENT: '#3b82f6', PROCEDURE: '#f59e0b',
  LESSON_LEARNED: '#f97316', CODE_ENTITY: '#ef4444', DOCUMENT: '#a855f7',
  // Code entity types
  FUNCTION: '#818cf8', METHOD: '#6366f1', CLASS: '#e879f9',
  INTERFACE: '#c084fc', TYPE: '#fb7185', CONSTRUCTOR: '#f472b6',
  ENUM: '#34d399', CONSTANT: '#fbbf24', VARIABLE: '#94a3b8',
};

class LODManager {
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

    // Progressive loading: fetch children from API if not already loaded
    if (!cluster.__childrenLoaded) {
      const token = localStorage.getItem('admin_token') || '';
      fetch('/api/admin/kb/graph/cluster/' + clusterId, {
        headers: { 'Authorization': 'Bearer ' + token }
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.nodes) {
            // Add fetched nodes to allNodes
            const existingIds = new Set(this._allNodes.map(n => n.id));
            for (const node of data.nodes) {
              if (!existingIds.has(node.id)) {
                // Position around cluster center
                node.x = cluster.center.x + (Math.random() - 0.5) * 60;
                node.y = cluster.center.y + (Math.random() - 0.5) * 60;
                node.z = cluster.center.z + (Math.random() - 0.5) * 60;
                this._allNodes.push(node);
              }
            }
            // Update childNodeIds with fetched node IDs
            cluster.childNodeIds = data.nodes.map(n => n.id);
            // Add edges
            if (data.edges) {
              for (const e of data.edges) this._allEdges.push(e);
            }
            cluster.__childrenLoaded = true;
            // Now do the expand animation
            this._doExpand(cluster, clusterId);
          }
        })
        .catch(() => {
          // Fallback: expand with existing data
          this._doExpand(cluster, clusterId);
        });
    } else {
      this._doExpand(cluster, clusterId);
    }
    return true;
  }

  _doExpand(cluster, clusterId) {
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

// Expose globally for non-module script loading
window.LODManager = LODManager;
