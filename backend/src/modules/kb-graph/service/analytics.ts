/**
 * KB graph analytics — community detection + PageRank (BR-18 extraction).
 * Pure algorithms over edges loaded from the injected adapter.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

async function loadAllEdges(db: DatabaseAdapter): Promise<Array<{ source: string; target: string; weight: number }>> {
  return db.allAsync<any>(
    'SELECT source, target, weight FROM graph_edges', [],
  ).then(rows => rows.map(r => ({ source: r.source, target: r.target, weight: r.weight })));
}

/**
 * Community detection via label propagation.
 * Returns clusters (community -> node IDs) sorted by size descending.
 * @param maxIterations - Max label propagation passes (default 20)
 * @param minClusterSize - Minimum nodes per cluster in output (default 2)
 */
export async function detectCommunities(
  db: DatabaseAdapter,
  maxIterations = 20, minClusterSize = 2,
): Promise<Array<{ community: string; nodeCount: number; nodeIds: string[]; avgWeight: number }>> {
  const edges = await loadAllEdges(db);
  if (edges.length === 0) return [];

  const { adjacency, nodeLabels } = buildAdjacency(edges);
  propagateLabels(adjacency, nodeLabels, maxIterations);

  const communities = collectCommunities(nodeLabels);
  accumulateWeights(edges, nodeLabels, communities);

  return Array.from(communities.entries())
    .filter(([, c]) => c.nodeIds.length >= minClusterSize)
    .map(([community, c]) => ({
      community,
      nodeCount: c.nodeIds.length,
      nodeIds: c.nodeIds,
      avgWeight: c.edgeCount > 0 ? Math.round((c.totalWeight / c.edgeCount) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}

function buildAdjacency(edges: Array<{ source: string; target: string; weight: number }>) {
  const nodeSet = new Set<string>();
  const adjacency = new Map<string, Map<string, number>>();
  for (const e of edges) {
    nodeSet.add(e.source); nodeSet.add(e.target);
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Map());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Map());
    adjacency.get(e.source)!.set(e.target, (adjacency.get(e.source)!.get(e.target) || 0) + e.weight);
    adjacency.get(e.target)!.set(e.source, (adjacency.get(e.target)!.get(e.source) || 0) + e.weight);
  }
  const nodes = Array.from(nodeSet);
  const nodeLabels = new Map<string, string>();
  for (const n of nodes) nodeLabels.set(n, n);
  return { adjacency, nodeLabels };
}

function propagateLabels(
  adjacency: Map<string, Map<string, number>>,
  nodeLabels: Map<string, string>,
  maxIterations: number,
): void {
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = 0;
    for (const [n, neighbors] of adjacency) {
      if (!neighbors || neighbors.size === 0) continue;
      const freq = new Map<string, number>();
      for (const [neighbor, w] of neighbors) {
        const lbl = nodeLabels.get(neighbor)!;
        freq.set(lbl, (freq.get(lbl) || 0) + w);
      }
      let bestLabel = nodeLabels.get(n)!;
      let bestCount = 0;
      for (const [lbl, count] of freq) {
        if (count > bestCount) { bestCount = count; bestLabel = lbl; }
      }
      if (bestLabel !== nodeLabels.get(n)) { nodeLabels.set(n, bestLabel); changed++; }
    }
    if (changed === 0) break;
  }
}

type CommunityAcc = { nodeIds: string[]; totalWeight: number; edgeCount: number };

function collectCommunities(nodeLabels: Map<string, string>): Map<string, CommunityAcc> {
  const communities = new Map<string, CommunityAcc>();
  for (const [n, lbl] of nodeLabels) {
    if (!communities.has(lbl)) communities.set(lbl, { nodeIds: [], totalWeight: 0, edgeCount: 0 });
    communities.get(lbl)!.nodeIds.push(n);
  }
  return communities;
}

function accumulateWeights(
  edges: Array<{ source: string; target: string; weight: number }>,
  nodeLabels: Map<string, string>,
  communities: Map<string, CommunityAcc>,
): void {
  for (const e of edges) {
    const sl = nodeLabels.get(e.source);
    const tl = nodeLabels.get(e.target);
    if (sl && tl && sl === tl) {
      const c = communities.get(sl)!;
      c.totalWeight += e.weight;
      c.edgeCount++;
    }
  }
}

/**
 * Simplified PageRank — iterative rank propagation over graph edges.
 * @param dampingFactor - Probability of following an edge vs teleporting (default 0.85)
 * @param maxIterations - Max iterations (default 20)
 * @param convergence - Stop when max rank change < this (default 0.001)
 * @param topN - Return only top-N nodes (default 20, 0 = all)
 */
export async function computePageRank(
  db: DatabaseAdapter,
  dampingFactor = 0.85, maxIterations = 20, convergence = 0.001, topN = 20,
): Promise<Array<{ nodeId: string; rank: number; label: string; type: string }>> {
  const edges = await loadAllEdges(db);
  if (edges.length === 0) return [];

  const { nodeSet, outDegree, inLinks } = buildLinkMaps(edges);
  const rank = iteratePageRank(Array.from(nodeSet), outDegree, inLinks, dampingFactor, maxIterations, convergence);

  const nodeRows = await db.allAsync<any>(
    'SELECT entry_id, label, type FROM graph_nodes', [],
  );
  const nodeMeta = new Map<string, { label: string; type: string }>();
  for (const r of nodeRows) nodeMeta.set(r.entry_id, { label: r.label, type: r.type });

  const ranked = Array.from(rank.entries())
    .map(([nodeId, pr]) => {
      const meta = nodeMeta.get(nodeId) || { label: nodeId, type: 'UNKNOWN' };
      return { nodeId, rank: Math.round(pr * 100000) / 100000, label: meta.label, type: meta.type };
    })
    .sort((a, b) => b.rank - a.rank);

  return topN > 0 ? ranked.slice(0, topN) : ranked;
}

function buildLinkMaps(edges: Array<{ source: string; target: string; weight: number }>) {
  const outDegree = new Map<string, number>();
  const inLinks = new Map<string, Map<string, number>>();
  const nodeSet = new Set<string>();

  for (const e of edges) {
    nodeSet.add(e.source); nodeSet.add(e.target);
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
    if (!inLinks.has(e.target)) inLinks.set(e.target, new Map());
    inLinks.get(e.target)!.set(e.source, e.weight);
  }
  return { nodeSet, outDegree, inLinks };
}

function iteratePageRank(
  nodes: string[],
  outDegree: Map<string, number>,
  inLinks: Map<string, Map<string, number>>,
  dampingFactor: number, maxIterations: number, convergence: number,
): Map<string, number> {
  const N = nodes.length;
  const rank = new Map<string, number>();
  const teleport = (1 - dampingFactor) / N;

  for (const n of nodes) rank.set(n, 1 / N);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newRank = new Map<string, number>();
    let maxDelta = 0;

    for (const n of nodes) {
      let sum = 0;
      const incoming = inLinks.get(n);
      if (incoming) {
        for (const [source, weight] of incoming) {
          const deg = outDegree.get(source) || 1;
          sum += (rank.get(source) || 0) * (weight / deg);
        }
      }
      const pr = teleport + dampingFactor * sum;
      newRank.set(n, pr);
      maxDelta = Math.max(maxDelta, Math.abs(pr - (rank.get(n) || 0)));
    }

    for (const [n, pr] of newRank) rank.set(n, pr);
    if (maxDelta < convergence) break;
  }
  return rank;
}
