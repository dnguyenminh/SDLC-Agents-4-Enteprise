/**
 * LOD Manager — runtime internals: camera-distance checks, budget enforcement,
 * super-node/graph-data synchronization and geometry helpers.
 * Load order: AFTER lod-manager/lod-manager-core.js — patches the private
 * methods onto the LODManager prototype (global from the core module).
 * All methods are invoked at runtime, after both scripts have loaded.
 */
Object.assign(LODManager.prototype, {

  // --- Private methods ---

  _startTick() {
    let lastCheckTime = 0;
    const CHECK_INTERVAL = 500; // Only check every 500ms to avoid interfering with zoom
    const tick = () => {
      if (!this._initialized) return;
      const now = performance.now();
      if (now - lastCheckTime >= CHECK_INTERVAL) {
        lastCheckTime = now;
        this._checkDistances();
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

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
  },

  _budgetAllows(cluster) {
    return (this._visibleNodes.size - 1 + cluster.childNodeIds.length) <= this._config.maxVisibleNodes;
  },

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
  },

  _showSuperNodes() {
    const superNodes = [];
    // Build node→cluster map for edge aggregation
    const nodeToCluster = new Map();
    for (const [id, cluster] of this._clusters) {
      superNodes.push({
        id: cluster.id, name: cluster.label, type: cluster.dominantType,
        x: cluster.center.x, y: cluster.center.y, z: cluster.center.z,
        __isSuper: true, __childCount: cluster.childNodeIds.length, __cluster: cluster
      });
      this._visibleNodes.add(cluster.id);
      for (const nid of cluster.childNodeIds) nodeToCluster.set(nid, cluster.id);
    }
    // Create inter-cluster edges (deduplicated)
    const edgeSet = new Set();
    const interClusterEdges = [];
    for (const e of this._allEdges) {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      const sc = nodeToCluster.get(s);
      const tc = nodeToCluster.get(t);
      if (sc && tc && sc !== tc) {
        const key = sc < tc ? `${sc}|${tc}` : `${tc}|${sc}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          interClusterEdges.push({ source: sc, target: tc });
        }
      }
    }
    this._graph.graphData({ nodes: superNodes, links: interClusterEdges });
    this._graph.nodeVal(n => n.__isSuper ? 2 + Math.log(n.__childCount) * 2 : 4);
    this._graph.nodeColor(n => COLORS[n.type] || '#38bdf8');
    this._graph.nodeLabel(n => n.__isSuper ? `${n.name} (${n.__childCount} nodes)` : `[${n.type}] ${n.name}`);
    // Auto fit view after LOD initializes
    setTimeout(() => { try { this._graph.zoomToFit(400, 50); } catch(e){} }, 1000);
  },

  _getChildNodes(cluster) {
    const nodeMap = new Map(this._allNodes.map(n => [n.id, n]));
    return cluster.childNodeIds.map(id => nodeMap.get(id)).filter(Boolean);
  },

  _getVisibleEdges(visibleNodes) {
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    return this._allEdges.filter(e => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });
  },

  _updateGraphData() {
    const nodes = [];
    const nodeMap = new Map(this._allNodes.map(n => [n.id, n]));
    for (const [id, cluster] of this._clusters) {
      if (cluster.state === 'COLLAPSED' || cluster.state === 'COLLAPSING') {
        nodes.push({
          id: cluster.id, name: cluster.label, type: cluster.dominantType,
          x: cluster.center.x, y: cluster.center.y, z: cluster.center.z,
          __isSuper: true, __childCount: cluster.childNodeIds.length, __cluster: cluster
        });
      } else {
        for (const nid of cluster.childNodeIds) {
          const node = nodeMap.get(nid);
          if (node) nodes.push(node);
        }
      }
    }
    const links = this._getVisibleEdges(nodes);
    // Preserve camera position across graph data updates
    let camPos = null;
    let camLookAt = null;
    try {
      const cam = this._graph.camera();
      camPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      const controls = this._graph.controls();
      if (controls && controls.target) {
        camLookAt = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
      }
    } catch(e) {}
    this._graph.graphData({ nodes, links });
    // Restore camera position after graphData update
    if (camPos) {
      this._graph.cameraPosition(camPos, camLookAt, 0);
    }
  },

  _disableLOD() {
    this.dispose();
    this._graph.graphData({ nodes: this._allNodes, links: this._allEdges });
  },

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
  },

  _distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
});
