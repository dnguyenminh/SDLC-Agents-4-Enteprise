/**
 * LOD Clustering — Louvain Community Detection (core class)
 * KSA-143: KB Graph Level of Detail / Semantic Zoom
 *
 * Deterministic clustering algorithm for graph nodes.
 * Produces communities of 5-50 nodes for LOD rendering.
 *
 * Load order (classic <script> tags, see admin/index.html):
 *   1. lod-clustering/lod-clustering-core.js     (this file — class + window export)
 *   2. lod-clustering/lod-clustering-clusters.js (cluster assembly helpers, prototype patch)
 */
class LODClustering {
  constructor(options = {}) {
    this._minSize = options.minClusterSize || 5;
    this._maxSize = options.maxClusterSize || 50;
    this._maxClusters = options.maxClusters || 100;
  }

  compute(nodes, edges) {
    if (!nodes || nodes.length === 0) return [];
    const edgeCount = new Map();
    for (const e of edges) {
      edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
      edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
    }
    const connected = nodes.filter(n => (edgeCount.get(n.id) || 0) > 0);
    const isolated = nodes.filter(n => (edgeCount.get(n.id) || 0) === 0);
    let connectedClusters = [];
    if (connected.length >= this._minSize) {
      connected.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const adj = this._buildAdjacency(connected, edges);
      const communities = this._louvainPhase1(connected, adj);
      const processed = this._enforceSizeConstraints(communities, connected);
      connectedClusters = this._buildClusters(processed, nodes);
    }
    let isolatedClusters = [];
    if (isolated.length > 0) {
      const typeGroups = new Map();
      for (const n of isolated) {
        const key = n.type || 'UNKNOWN';
        if (!typeGroups.has(key)) typeGroups.set(key, []);
        typeGroups.get(key).push(n.id);
      }
      const isoCommunities = [];
      for (const [type, ids] of typeGroups) {
        for (let i = 0; i < ids.length; i += this._maxSize) {
          const chunk = ids.slice(i, i + this._maxSize);
          if (chunk.length >= 2) isoCommunities.push(chunk);
        }
      }
      isolatedClusters = this._buildClusters(isoCommunities, nodes, connectedClusters.length);
    }
    const allClusters = [...connectedClusters, ...isolatedClusters];
    return this._enforceMaxClusters(allClusters);
  }

  recompute(nodes, edges) { return this.compute(nodes, edges); }

  getClusterForNode(nodeId, clusters) {
    for (const c of clusters) { if (c.childNodeIds.includes(nodeId)) return c; }
    return null;
  }

  _buildAdjacency(nodes, edges) {
    const nodeSet = new Set(nodes.map(n => n.id));
    const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type || '']));
    const adj = new Map();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      if (!nodeSet.has(s) || !nodeSet.has(t)) continue;
      const typeMatch = nodeTypeMap.get(s) === nodeTypeMap.get(t) ? 1 : 0;
      const weight = 2 + typeMatch;
      adj.get(s).push({ target: t, weight });
      adj.get(t).push({ target: s, weight });
    }
    return adj;
  }

  _louvainPhase1(nodes, adj) {
    const community = new Map();
    nodes.forEach((n, i) => community.set(n.id, i));
    const totalWeight = this._totalWeight(adj);
    let improved = true;
    let iterations = 0;
    const maxIter = 20;
    while (improved && iterations < maxIter) {
      improved = false;
      iterations++;
      for (const node of nodes) {
        const nodeId = node.id;
        const currentComm = community.get(nodeId);
        const neighborComms = new Map();
        for (const { target, weight } of adj.get(nodeId)) {
          const nc = community.get(target);
          neighborComms.set(nc, (neighborComms.get(nc) || 0) + weight);
        }
        let bestComm = currentComm;
        let bestGain = 0;
        for (const [comm, edgeWeight] of neighborComms) {
          if (comm === currentComm) continue;
          const gain = this._modularityGain(nodeId, comm, community, adj, totalWeight, edgeWeight);
          if (gain > bestGain) { bestGain = gain; bestComm = comm; }
        }
        if (bestComm !== currentComm) { community.set(nodeId, bestComm); improved = true; }
      }
    }
    const groups = new Map();
    for (const [nodeId, comm] of community) {
      if (!groups.has(comm)) groups.set(comm, []);
      groups.get(comm).push(nodeId);
    }
    return Array.from(groups.values());
  }

  _modularityGain(nodeId, targetComm, community, adj, totalWeight, edgeWeightToComm) {
    if (totalWeight === 0) return 0;
    const ki = adj.get(nodeId).reduce((sum, e) => sum + e.weight, 0);
    let sumIn = 0;
    for (const [nid, comm] of community) {
      if (comm !== targetComm) continue;
      for (const { target, weight } of adj.get(nid)) {
        if (community.get(target) === targetComm) sumIn += weight;
      }
    }
    sumIn /= 2;
    let sumTot = 0;
    for (const [nid, comm] of community) {
      if (comm !== targetComm) continue;
      sumTot += adj.get(nid).reduce((s, e) => s + e.weight, 0);
    }
    const m2 = totalWeight * 2;
    return (edgeWeightToComm / m2) - (sumTot * ki) / (m2 * m2);
  }

  _totalWeight(adj) {
    let total = 0;
    for (const edges of adj.values()) { for (const e of edges) total += e.weight; }
    return total / 2;
  }
}

// Expose globally for non-module script loading
window.LODClustering = LODClustering;
