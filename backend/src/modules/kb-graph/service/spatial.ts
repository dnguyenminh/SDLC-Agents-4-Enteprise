/**
 * SA4E-51 — Spatial query and edge-building functions for KB Graph.
 * Uses DatabaseAdapter async methods so queries run on whichever engine is active.
 * TEMP TABLE removed: replaced with IN clause for PostgreSQL compatibility.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { SpatialQueryParams, SpatialGraphResult, GraphNode, GraphEdge } from './constants.js';
import { rowToNode } from './nodes.js';

// Cache counters to avoid per-request COUNT queries; refreshed every 60s
let cachedEdgeCount = 0;
let cachedNodeCount = 0;
let cachedCountTime = 0;

/** Refresh in-memory count cache if stale (>60s). */
async function refreshNodeCache(db: DatabaseAdapter): Promise<void> {
  if (cachedCountTime === 0 || Date.now() - cachedCountTime > 60000) {
    const edgeRow = await db.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_edges', []);
    const nodeRow = await db.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_nodes', []);
    cachedEdgeCount = edgeRow?.cnt ?? 0;
    cachedNodeCount = nodeRow?.cnt ?? 0;
    cachedCountTime = Date.now();
  }
}

/**
 * Retrieve edges where BOTH endpoints are in the given node set.
 * Uses IN clause instead of TEMP TABLE — compatible with PostgreSQL.
 */
async function getEdgesForNodes(nodes: GraphNode[], db: DatabaseAdapter): Promise<GraphEdge[]> {
  if (nodes.length === 0) return [];
  const ids = nodes.map(n => n.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.allAsync<{ source: string; target: string; weight: number; rel_type: string }>(
    `SELECT source, target, weight, rel_type FROM graph_edges
     WHERE source IN (${placeholders}) AND target IN (${placeholders}) LIMIT 3000`,
    [...ids, ...ids],
  );
  return rows.map(r => ({ source: r.source, target: r.target, weight: r.weight, type: r.rel_type }));
}

/** Return macro-level nodes (level=0) sampled evenly across types. */
async function getMacroNodes(
  db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: GraphNode[]; level: string }> {
  const projectFilter = projectId ? ' AND project_id = ?' : '';
  const projectArgs: unknown[] = projectId ? [projectId] : [];
  const typeRows = await db.allAsync<{ type: string }>(
    `SELECT DISTINCT type FROM graph_nodes WHERE level = 0${projectFilter}`, projectArgs,
  );
  const types = typeRows.map(r => r.type);
  const perType = Math.max(20, Math.floor(500 / Math.max(types.length, 1)));
  const allNodes: Record<string, unknown>[] = [];
  for (const t of types) {
    const rows = await db.allAsync<Record<string, unknown>>(
      `SELECT * FROM graph_nodes WHERE level = 0 AND type = ?${projectFilter} LIMIT ?`,
      [t, ...projectArgs, perType],
    );
    allNodes.push(...rows);
  }
  return { nodes: allNodes.slice(0, 500).map(rowToNode), level: 'macro' };
}

/** Return mid-level nodes (level<=1) nearest to camera position. */
async function getMidNodes(
  camX: number, camY: number, camZ: number, db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: GraphNode[]; level: string }> {
  const projectFilter = projectId ? ' AND project_id = ?' : '';
  const projectArgs: unknown[] = projectId ? [projectId] : [];
  const rows = await db.allAsync<Record<string, unknown>>(
    `SELECT *, ABS(x - ?) + ABS(y - ?) + ABS(z - ?) as manhattan_dist
     FROM graph_nodes WHERE level <= 1${projectFilter}
     ORDER BY manhattan_dist ASC LIMIT 1500`,
    [camX, camY, camZ, ...projectArgs],
  );
  return { nodes: rows.map(rowToNode), level: 'mid' };
}

/** Return micro-level nodes nearest to camera (full detail mode). */
async function getMicroNodes(
  camX: number, camY: number, camZ: number, db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: GraphNode[]; level: string }> {
  const projectFilter = projectId ? ' WHERE project_id = ?' : '';
  const projectArgs: unknown[] = projectId ? [projectId] : [];
  const nearNodes = await db.allAsync<Record<string, unknown>>(
    `SELECT *, ABS(x - ?) + ABS(y - ?) + ABS(z - ?) as manhattan_dist
     FROM graph_nodes${projectFilter}
     ORDER BY manhattan_dist ASC LIMIT 10000`,
    [camX, camY, camZ, ...projectArgs],
  );
  return { nodes: nearNodes.map(rowToNode), level: 'micro' };
}

/** Dispatch to macro/mid/micro based on zoom level. */
async function getNodesByZoom(
  params: SpatialQueryParams, db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: GraphNode[]; level: string }> {
  const { camX, camY, camZ, zoom } = params;
  if (zoom > 500) return getMacroNodes(db, projectId);
  if (zoom > 200) return getMidNodes(camX, camY, camZ, db, projectId);
  return getMicroNodes(camX, camY, camZ, db, projectId);
}

/** Build spatial grid buckets (150-unit voxels) from all graph_nodes. */
async function buildBuckets(db: DatabaseAdapter) {
  type NodeRow = { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string };
  const allNodeRows = await db.allAsync<NodeRow>(
    'SELECT entry_id, x, y, z, cluster_id, type FROM graph_nodes', [],
  );
  const buckets = new Map<string, NodeRow[]>();
  for (const row of allNodeRows) {
    const key = `${Math.floor(row.x / 150)},${Math.floor(row.y / 150)},${Math.floor(row.z / 150)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return buckets;
}

/** Insert SPATIAL edges for nodes that share a voxel bucket. */
async function insertSpatialEdges(
  buckets: Map<string, { entry_id: string }[]>, db: DatabaseAdapter,
): Promise<number> {
  let edgesCreated = 0;
  await db.transactionAsync(async () => {
    for (const [, members] of buckets) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < Math.min(members.length, i + 4); j++) {
          await db.runAsync(
            'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
            [members[i].entry_id, members[j].entry_id, 0.7, 'SPATIAL'],
          );
          edgesCreated++;
        }
      }
    }
  });
  return edgesCreated;
}

/**
 * Build spatial proximity edges between nodes in the same voxel.
 * @returns Number of edges created
 */
export async function buildSpatialEdges(db: DatabaseAdapter): Promise<number> {
  return insertSpatialEdges(await buildBuckets(db), db);
}

/**
 * Build cross-cluster hub edges (one representative per cluster).
 * @returns Number of edges created
 */
export async function buildCrossClusterEdges(db: DatabaseAdapter): Promise<number> {
  type NodeRow = { entry_id: string; cluster_id: string };
  const allNodeRows = await db.allAsync<NodeRow>(
    'SELECT entry_id, cluster_id FROM graph_nodes', [],
  );
  const clusterMap = new Map<string, string>();
  for (const row of allNodeRows) {
    const cid = row.cluster_id || 'default';
    if (!clusterMap.has(cid)) clusterMap.set(cid, row.entry_id);
  }
  const hubs = Array.from(clusterMap.values());
  let edgesCreated = 0;
  await db.transactionAsync(async () => {
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < Math.min(hubs.length, i + 5); j++) {
        await db.runAsync(
          'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
          [hubs[i], hubs[j], 0.5, 'CLUSTER_LINK'],
        );
        edgesCreated++;
      }
    }
  });
  return edgesCreated;
}

/**
 * Return flat position list for all nodes (used by 3D viewport initialisation).
 * @param projectId - Optional project scope
 */
export async function getAllPositions(
  db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: { id: string; x: number; y: number; z: number; type: string; tier: string; label: string }[]; total: number }> {
  const projectFilter = projectId ? ' WHERE project_id = ?' : '';
  const projectArgs: unknown[] = projectId ? [projectId] : [];
  type PosRow = { entry_id: string; x: number; y: number; z: number; type: string; tier: string; label: string };
  const rows = await db.allAsync<PosRow>(
    `SELECT entry_id, x, y, z, type, tier, label FROM graph_nodes${projectFilter}`, projectArgs,
  );
  const nodes = rows.map(r => ({ id: r.entry_id, x: r.x, y: r.y, z: r.z, type: r.type, tier: r.tier, label: r.label }));
  return { nodes, total: nodes.length };
}

/**
 * Execute a spatial query and return nodes + edges for the current camera view.
 * @param params - Camera position and zoom level
 * @param db - DatabaseAdapter
 * @param logger - Pino logger
 * @param projectId - Optional project scope
 */
export async function spatialQuery(
  params: SpatialQueryParams, db: DatabaseAdapter, logger: Logger, projectId?: string,
): Promise<SpatialGraphResult> {
  const startTime = performance.now();
  const { nodes, level } = await getNodesByZoom(params, db, projectId);
  const edges = await getEdgesForNodes(nodes, db);
  const queryTimeMs = performance.now() - startTime;
  await refreshNodeCache(db);
  return {
    nodes, edges,
    stats: {
      totalNodes: nodes.length, totalEdges: edges.length,
      queryTimeMs: Math.round(queryTimeMs * 100) / 100,
      level, totalInDb: cachedNodeCount, totalEdgesInDb: cachedEdgeCount,
    },
  };
}
