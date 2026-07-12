/**
 * Spatial query and edge-building functions for KB Graph.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import type { SpatialQueryParams, SpatialGraphResult, GraphNode, GraphEdge } from './constants.js';
import { rowToNode } from './nodes.js';

let cachedEdgeCount = 0;
let cachedNodeCount = 0;
let cachedCountTime = 0;

function refreshNodeCache(db: Database.Database): void {
  if (cachedCountTime === 0 || Date.now() - cachedCountTime > 60000) {
    cachedEdgeCount = (db.prepare('SELECT COUNT(*) as cnt FROM graph_edges').get() as { cnt: number }).cnt;
    cachedNodeCount = (db.prepare('SELECT COUNT(*) as cnt FROM graph_nodes').get() as { cnt: number }).cnt;
    cachedCountTime = Date.now();
  }
}

function getEdgesForNodes(nodes: GraphNode[], db: Database.Database): GraphEdge[] {
  if (nodes.length === 0) return [];
  const ids = nodes.map(n => n.id);
  db.exec('CREATE TEMP TABLE IF NOT EXISTS _vis (id TEXT PRIMARY KEY)');
  db.exec('DELETE FROM _vis');
  const insert = db.prepare('INSERT OR IGNORE INTO _vis (id) VALUES (?)');
  db.transaction((nodeIds: string[]) => { for (const id of nodeIds) insert.run(id); })(ids);
  return (db.prepare(`
    SELECT e.source, e.target, e.weight, e.rel_type
    FROM graph_edges e
    INNER JOIN _vis v1 ON e.source = v1.id
    INNER JOIN _vis v2 ON e.target = v2.id
    LIMIT 3000
  `).all() as { source: string; target: string; weight: number; rel_type: string }[])
    .map((row: { source: string; target: string; weight: number; rel_type: string }) => ({ source: row.source, target: row.target, weight: row.weight, type: row.rel_type }));
}

function getMacroNodes(db: Database.Database): { nodes: GraphNode[]; level: string } {
  const types = (db.prepare('SELECT DISTINCT type FROM graph_nodes WHERE level = 0').all() as { type: string }[]).map((r: { type: string }) => r.type);
  const perType = Math.max(20, Math.floor(500 / Math.max(types.length, 1)));
  const allNodes: Record<string, unknown>[] = [];
  for (const t of types) {
    const rows = db.prepare('SELECT * FROM graph_nodes WHERE level = 0 AND type = ? LIMIT ?').all(t, perType) as Record<string, unknown>[];
    allNodes.push(...rows);
  }
  return { nodes: allNodes.slice(0, 500).map(rowToNode), level: 'macro' };
}

function getMidNodes(camX: number, camY: number, camZ: number, db: Database.Database): { nodes: GraphNode[]; level: string } {
  const nodes = (db.prepare(`
    SELECT *, ABS(x - ?) + ABS(y - ?) + ABS(z - ?) as manhattan_dist
    FROM graph_nodes WHERE level <= 1
    ORDER BY manhattan_dist ASC LIMIT 1500
  `).all(camX, camY, camZ) as Record<string, unknown>[]).map(rowToNode);
  return { nodes, level: 'mid' };
}

function getMicroNodes(camX: number, camY: number, camZ: number, db: Database.Database): { nodes: GraphNode[]; level: string } {
  const nearNodes = db.prepare(`
    SELECT *, ABS(x - ?) + ABS(y - ?) + ABS(z - ?) as manhattan_dist
    FROM graph_nodes
    ORDER BY manhattan_dist ASC LIMIT 10000
  `).all(camX, camY, camZ) as Record<string, unknown>[];
  return { nodes: nearNodes.map(rowToNode), level: 'micro' };
}

function getNodesByZoom(params: SpatialQueryParams, db: Database.Database): { nodes: GraphNode[]; level: string } {
  const { camX, camY, camZ, zoom } = params;
  if (zoom > 500) return getMacroNodes(db);
  if (zoom > 200) return getMidNodes(camX, camY, camZ, db);
  return getMicroNodes(camX, camY, camZ, db);
}

function buildBuckets(db: Database.Database): Map<string, { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string }[]> {
  const allNodeRows = db.prepare('SELECT entry_id, x, y, z, cluster_id, type FROM graph_nodes').all() as { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string }[];
  const buckets = new Map<string, { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string }[]>();
  for (const row of allNodeRows) {
    const bx = Math.floor(row.x / 150);
    const by = Math.floor(row.y / 150);
    const bz = Math.floor(row.z / 150);
    const key = `${bx},${by},${bz}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return buckets;
}

function insertSpatialEdges(buckets: Map<string, { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string }[]>, db: Database.Database): number {
  const insertEdge = db.prepare('INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)');
  let edgesCreated = 0;
  db.transaction(() => {
    for (const [, members] of buckets) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < Math.min(members.length, i + 4); j++) {
          insertEdge.run(members[i].entry_id, members[j].entry_id, 0.7, 'SPATIAL');
          edgesCreated++;
        }
      }
    }
  })();
  return edgesCreated;
}

export function buildSpatialEdges(db: Database.Database): number {
  const buckets = buildBuckets(db);
  return insertSpatialEdges(buckets, db);
}

export function buildCrossClusterEdges(db: Database.Database): number {
  const allNodeRows = db.prepare('SELECT entry_id, x, y, z, cluster_id, type FROM graph_nodes').all() as { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string }[];
  const clusterMap = new Map<string, string>();
  for (const row of allNodeRows) {
    const cid = row.cluster_id || 'default';
    if (!clusterMap.has(cid)) clusterMap.set(cid, row.entry_id);
  }
  const hubs = Array.from(clusterMap.values());
  const insertEdge = db.prepare('INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)');
  let edgesCreated = 0;
  db.transaction(() => {
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < Math.min(hubs.length, i + 5); j++) {
        insertEdge.run(hubs[i], hubs[j], 0.5, 'CLUSTER_LINK');
        edgesCreated++;
      }
    }
  })();
  return edgesCreated;
}

export function getAllPositions(db: Database.Database): { nodes: { id: string; x: number; y: number; z: number; type: string; tier: string; label: string }[]; total: number } {
  const rows = db.prepare('SELECT entry_id, x, y, z, type, tier, label FROM graph_nodes').all() as { entry_id: string; x: number; y: number; z: number; type: string; tier: string; label: string }[];
  const nodes = rows.map((r: { entry_id: string; x: number; y: number; z: number; type: string; tier: string; label: string }) => ({
    id: r.entry_id, x: r.x, y: r.y, z: r.z, type: r.type, tier: r.tier, label: r.label,
  }));
  return { nodes, total: nodes.length };
}

export function spatialQuery(params: SpatialQueryParams, db: Database.Database, logger: Logger): SpatialGraphResult {
  const startTime = performance.now();
  const { nodes, level } = getNodesByZoom(params, db);
  const edges = getEdgesForNodes(nodes, db);
  const queryTimeMs = performance.now() - startTime;
  refreshNodeCache(db);
  return {
    nodes, edges,
    stats: {
      totalNodes: nodes.length, totalEdges: edges.length,
      queryTimeMs: Math.round(queryTimeMs * 100) / 100,
      level, totalInDb: cachedNodeCount, totalEdgesInDb: cachedEdgeCount,
    },
  };
}
