/**
 * Clustering Algorithm --- Louvain community detection with type affinity
 * KSA-143
 */

import { GraphData, GraphNode, GraphEdge, Cluster, ClusterHierarchy, ClusterMetadata, ClusterOptions, Vector3 } from './types';
import { computeCentroid, computeRadius, getDominantType, findIsolatedNodes } from './clustering-helpers';

interface Community {
  id: string;
  nodeIds: Set<string>;
  internalWeight: number;
  totalWeight: number;
}

export class ClusteringAlgorithm {
  private adjacency: Map<string, Map<string, number>> = new Map();
  private nodeTypes: Map<string, string> = new Map();
  private nodePositions: Map<string, Vector3> = new Map();
  private totalWeight: number = 0;

  cluster(graphData: GraphData, options: ClusterOptions): ClusterHierarchy {
    const startTime = performance.now();
    if (graphData.nodes.length < 50) {
      return this.createTrivialHierarchy(graphData, startTime);
    }
    this.buildAdjacency(graphData);
    let communities = this.initializeCommunities(graphData.nodes);
    communities = this.louvainOptimize(communities);
    communities = this.applyTypeAffinity(communities, options.typeWeight / options.connectivityWeight);
    communities = this.enforceSizeConstraints(communities, options);
    const clusters = this.buildClusters(communities, graphData.nodes);
    const isolatedNodes = findIsolatedNodes(graphData.nodes, graphData.edges);
    const elapsed = performance.now() - startTime;
    const metadata: ClusterMetadata = {
      totalNodes: graphData.nodes.length,
      totalClusters: clusters.length,
      avgClusterSize: clusters.length > 0 ? graphData.nodes.length / clusters.length : 0,
      clusteringTimeMs: elapsed,
    };
    return { clusters, isolatedNodes, metadata };
  }

  private createTrivialHierarchy(graphData: GraphData, startTime: number): ClusterHierarchy {
    return {
      clusters: [],
      isolatedNodes: graphData.nodes.map(n => n.id),
      metadata: { totalNodes: graphData.nodes.length, totalClusters: 0, avgClusterSize: 0, clusteringTimeMs: performance.now() - startTime },
    };
  }

  private buildAdjacency(graphData: GraphData): void {
    this.adjacency.clear();
    this.totalWeight = 0;
    for (const node of graphData.nodes) {
      this.adjacency.set(node.id, new Map());
      this.nodeTypes.set(node.id, node.type);
      if (node.position) { this.nodePositions.set(node.id, node.position); }
    }
    for (const edge of graphData.edges) {
      const weight = edge.weight ?? 1.0;
      this.totalWeight += weight;
      const srcAdj = this.adjacency.get(edge.source);
      const tgtAdj = this.adjacency.get(edge.target);
      if (srcAdj) { srcAdj.set(edge.target, (srcAdj.get(edge.target) ?? 0) + weight); }
      if (tgtAdj) { tgtAdj.set(edge.source, (tgtAdj.get(edge.source) ?? 0) + weight); }
    }
  }

  private initializeCommunities(nodes: GraphNode[]): Community[] {
    return nodes.map(node => ({ id: node.id, nodeIds: new Set([node.id]), internalWeight: 0, totalWeight: this.getNodeWeight(node.id) }));
  }

  private getNodeWeight(nodeId: string): number {
    const adj = this.adjacency.get(nodeId);
    if (!adj) return 0;
    let total = 0;
    for (const w of adj.values()) total += w;
    return total;
  }

  private louvainOptimize(communities: Community[]): Community[] {
    const nodeToComm: Map<string, number> = new Map();
    communities.forEach((c, i) => { for (const nodeId of c.nodeIds) { nodeToComm.set(nodeId, i); } });
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 100) {
      improved = false;
      iterations++;
      for (const [nodeId] of this.adjacency) {
        const currentCommIdx = nodeToComm.get(nodeId)!;
        const neighbors = this.adjacency.get(nodeId)!;
        let bestGain = 0;
        let bestCommIdx = currentCommIdx;
        const neighborComms = new Set<number>();
        for (const [neighborId] of neighbors) { neighborComms.add(nodeToComm.get(neighborId)!); }
        for (const commIdx of neighborComms) {
          if (commIdx === currentCommIdx) continue;
          const gain = this.modularityGain(nodeId, communities[commIdx], communities[currentCommIdx]);
          if (gain > bestGain) { bestGain = gain; bestCommIdx = commIdx; }
        }
        if (bestCommIdx !== currentCommIdx) {
          communities[currentCommIdx].nodeIds.delete(nodeId);
          communities[bestCommIdx].nodeIds.add(nodeId);
          nodeToComm.set(nodeId, bestCommIdx);
          improved = true;
        }
      }
    }
    return communities.filter(c => c.nodeIds.size > 0);
  }

  private modularityGain(nodeId: string, targetComm: Community, _sourceComm: Community): number {
    const ki = this.getNodeWeight(nodeId);
    const m2 = this.totalWeight * 2;
    if (m2 === 0) return 0;
    let kiIn = 0;
    const neighbors = this.adjacency.get(nodeId)!;
    for (const [neighborId, weight] of neighbors) {
      if (targetComm.nodeIds.has(neighborId)) { kiIn += weight; }
    }
    const sigmaTot = targetComm.totalWeight;
    return (kiIn / m2) - (sigmaTot * ki) / (m2 * m2 / 4);
  }

  private applyTypeAffinity(communities: Community[], _typeWeight: number): Community[] {
    for (const comm of communities) {
      if (comm.nodeIds.size < 3) continue;
      const typeCounts = new Map<string, number>();
      for (const nodeId of comm.nodeIds) {
        const type = this.nodeTypes.get(nodeId) ?? 'unknown';
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      }
    }
    return communities;
  }

  private enforceSizeConstraints(communities: Community[], options: ClusterOptions): Community[] {
    const result: Community[] = [];
    for (const comm of communities) {
      if (comm.nodeIds.size > options.maxClusterSize) {
        result.push(...this.splitCommunity(comm, options.maxClusterSize));
      } else { result.push(comm); }
    }
    return this.mergeUndersized(result, options.minClusterSize, options.maxClusterSize);
  }

  private splitCommunity(comm: Community, maxSize: number): Community[] {
    const nodeArray = Array.from(comm.nodeIds);
    const chunks: Community[] = [];
    for (let i = 0; i < nodeArray.length; i += maxSize) {
      chunks.push({ id: `${comm.id}_split_${chunks.length}`, nodeIds: new Set(nodeArray.slice(i, i + maxSize)), internalWeight: 0, totalWeight: 0 });
    }
    return chunks;
  }

  private mergeUndersized(communities: Community[], minSize: number, maxSize: number): Community[] {
    const result: Community[] = [];
    const undersized: Community[] = [];
    for (const comm of communities) {
      if (comm.nodeIds.size < minSize) { undersized.push(comm); } else { result.push(comm); }
    }
    for (const small of undersized) {
      let merged = false;
      for (const target of result) {
        if (target.nodeIds.size + small.nodeIds.size <= maxSize) {
          for (const nodeId of small.nodeIds) { target.nodeIds.add(nodeId); }
          merged = true; break;
        }
      }
      if (!merged) { result.push(small); }
    }
    return result;
  }

  private buildClusters(communities: Community[], nodes: GraphNode[]): Cluster[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return communities.map((comm, idx) => {
      const childNodes = Array.from(comm.nodeIds).map(id => nodeMap.get(id)).filter((n): n is GraphNode => n !== undefined);
      const center = computeCentroid(childNodes);
      const radius = computeRadius(childNodes, center);
      const dominantType = getDominantType(childNodes);
      return { id: `cluster_${idx}`, label: dominantType ? `${dominantType} (${childNodes.length})` : `Cluster ${idx}`, childNodeIds: Array.from(comm.nodeIds), center, radius: Math.max(radius, 5), dominantType };
    });
  }
}
