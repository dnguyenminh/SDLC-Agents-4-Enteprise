/**
 * LOD Clustering — cluster assembly, size constraints & geometry helpers.
 * Load order: AFTER lod-clustering/lod-clustering-core.js — patches the helper
 * methods onto the LODClustering prototype (global from the core module).
 * All methods are invoked at runtime, after both scripts have loaded.
 */
Object.assign(LODClustering.prototype, {

  _enforceSizeConstraints(communities, nodes) {
    const result = [];
    for (const group of communities) {
      if (group.length < this._minSize) { result.push(group); }
      else if (group.length > this._maxSize) {
        for (let i = 0; i < group.length; i += this._maxSize) {
          const chunk = group.slice(i, i + this._maxSize);
          if (chunk.length >= this._minSize) result.push(chunk);
          else if (result.length > 0) result[result.length - 1].push(...chunk);
        }
      } else { result.push(group); }
    }
    const valid = [];
    const tooSmall = [];
    for (const g of result) {
      if (g.length >= this._minSize) valid.push(g);
      else tooSmall.push(g);
    }
    for (const small of tooSmall) {
      if (valid.length === 0) { valid.push(small); continue; }
      valid.sort((a, b) => a.length - b.length);
      valid[0].push(...small);
    }
    return valid;
  },

  _enforceMaxClusters(clusters) {
    while (clusters.length > this._maxClusters) {
      clusters.sort((a, b) => {
        const aLen = a.childNodeIds ? a.childNodeIds.length : a.length;
        const bLen = b.childNodeIds ? b.childNodeIds.length : b.length;
        return aLen - bLen;
      });
      const smallest = clusters[0];
      const second = clusters[1];
      if (smallest.childNodeIds && second.childNodeIds) {
        second.childNodeIds.push(...smallest.childNodeIds);
        second.label = `${second.dominantType} (${second.childNodeIds.length})`;
      }
      clusters = clusters.slice(1);
    }
    return clusters;
  },

  _buildClusters(communities, allNodes, idOffset = 0) {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    return communities.map((childIds, idx) => {
      const children = childIds.map(id => nodeMap.get(id)).filter(Boolean);
      const center = this._centroid(children);
      const radius = this._radius(children, center);
      const dominantType = this._dominantType(children);
      return {
        id: `cluster-${String(idx + idOffset).padStart(3, '0')}`,
        label: `${dominantType} (${childIds.length})`,
        childNodeIds: childIds,
        center,
        radius: Math.max(radius, 10),
        dominantType,
        state: 'COLLAPSED'
      };
    });
  },

  _centroid(nodes) {
    if (nodes.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = nodes.reduce((acc, n) => ({ x: acc.x + (n.x || 0), y: acc.y + (n.y || 0), z: acc.z + (n.z || 0) }), { x: 0, y: 0, z: 0 });
    return { x: sum.x / nodes.length, y: sum.y / nodes.length, z: sum.z / nodes.length };
  },

  _radius(nodes, center) {
    if (nodes.length === 0) return 0;
    let maxDist = 0;
    for (const n of nodes) {
      const dx = (n.x || 0) - center.x, dy = (n.y || 0) - center.y, dz = (n.z || 0) - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxDist) maxDist = dist;
    }
    return maxDist;
  },

  _dominantType(nodes) {
    const counts = {};
    for (const n of nodes) { const t = n.type || 'UNKNOWN'; counts[t] = (counts[t] || 0) + 1; }
    let max = 0, dominant = 'UNKNOWN';
    for (const [type, count] of Object.entries(counts)) { if (count > max) { max = count; dominant = type; } }
    return dominant;
  }
});
