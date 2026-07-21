/**
 * SA4E-51 — Node CRUD operations and position math for KB Graph.
 * Uses DatabaseAdapter instead of raw Database.Database so graph_nodes/graph_edges
 * are written to whichever engine is active (SQLite or PostgreSQL).
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { GraphNode } from './constants.js';
import { LEVEL_MAP } from './constants.js';

// Z-axis offset per node type — keeps layers visually separated in 3D space
const TYPE_Z_OFFSET: Record<string, number> = {
  REQUIREMENT: 0, ARCHITECTURE: 150, PROCEDURE: 300,
  CONTEXT: 50, DECISION: 200, DOCUMENT: 100,
  LESSON_LEARNED: -100, ERROR_PATTERN: -150,
  CLASS: 500, INTERFACE: 450, FUNCTION: 600, METHOD: 550,
  TYPE: 480, CONSTRUCTOR: 520, ENUM: 460, CONSTANT: 400, VARIABLE: 380,
  CODE_ENTITY: 470,
};

/**
 * Compute 3D position using Fibonacci sphere distribution.
 * Groups nodes by type into clusters on the sphere surface.
 * @param i - Index of this node within its group
 * @param total - Total node count (used for local spread radius)
 * @param type - Node type (determines Z offset layer)
 * @param groupId - Cluster index on the sphere
 * @param groupCount - Total number of clusters
 */
export function computePositionByIndex(
  i: number, total: number, type: string, groupId: number, groupCount: number,
) {
  const level = LEVEL_MAP[type.toUpperCase()] ?? 2;
  // Fibonacci sphere: distributes cluster centers evenly on sphere surface
  const golden = (1 + Math.sqrt(5)) / 2;
  const phi = Math.acos(1 - 2 * (groupId + 0.5) / Math.max(groupCount, 1));
  const theta_g = 2 * Math.PI * groupId / golden;
  const sphereRadius = 1200;
  const centerX = sphereRadius * Math.sin(phi) * Math.cos(theta_g);
  const centerY = sphereRadius * Math.sin(phi) * Math.sin(theta_g);
  const centerZ = sphereRadius * Math.cos(phi);
  const localSpread = 180;
  const theta_l = 2 * Math.PI * i / golden;
  const localR = Math.sqrt((i % 200) / 200) * localSpread;
  const zOffset = TYPE_Z_OFFSET[type.toUpperCase()] ?? level * 150;
  return {
    x: Math.round((centerX + localR * Math.cos(theta_l)) * 100) / 100,
    y: Math.round((centerY + localR * Math.sin(theta_l)) * 100) / 100,
    z: Math.round((centerZ + zOffset) * 100) / 100,
    level,
    clusterId: `cluster-${groupId}`,
  };
}

/**
 * Compute position for a new node by querying current graph state.
 * @param index - Insertion index (used for local spread)
 * @param type - Node type for Z-layer selection
 * @param db - DatabaseAdapter (reads graph_nodes)
 */
export function computePosition(index: number, type: string, db: DatabaseAdapter) {
  const typeRows = db.all<{ type: string }>('SELECT DISTINCT type FROM graph_nodes', []);
  const groups = new Map<string, number>();
  let gc = 0;
  for (const r of typeRows) groups.set(r.type, gc++);
  if (!groups.has(type.toUpperCase())) groups.set(type.toUpperCase(), gc++);
  const countRow = db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_nodes', []);
  const nodeCount = countRow?.cnt ?? 0;
  return computePositionByIndex(index, nodeCount + 1, type, groups.get(type.toUpperCase()) || 0, gc || 1);
}

/** Map a raw DB row to a typed GraphNode. */
export function rowToNode(row: any): GraphNode {
  return {
    id: row.entry_id, label: row.label, type: row.type, tier: row.tier,
    x: row.x, y: row.y, z: row.z, level: row.level, clusterId: row.cluster_id,
  };
}

/**
 * Fetch a single node by entry ID.
 * @returns GraphNode or null if not found
 */
export function getNode(entryId: string, db: DatabaseAdapter, logger: Logger): GraphNode | null {
  const row = db.get<any>('SELECT * FROM graph_nodes WHERE entry_id = ?', [entryId]);
  if (!row) return null;
  return rowToNode(row);
}

/**
 * Count nodes, optionally scoped to a project.
 * @param projectId - Optional project filter
 */
export function getNodeCount(db: DatabaseAdapter, projectId?: string): number {
  if (projectId) {
    return db.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM graph_nodes WHERE project_id = ?', [projectId],
    )?.cnt ?? 0;
  }
  return db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_nodes', [])?.cnt ?? 0;
}

/**
 * Insert a new node (or return existing) and auto-create type/tier edges.
 */
export function addNode(
  entryId: string, label: string, type: string, tier: string,
  db: DatabaseAdapter, logger: Logger, projectId = '',
): GraphNode {
  const existing = db.get<{ entry_id: string }>(
    'SELECT entry_id FROM graph_nodes WHERE entry_id = ?', [entryId],
  );
  if (existing) return getNode(entryId, db, logger)!;
  const count = getNodeCount(db);
  const pos = computePosition(count, type, db);
  db.run(
    'INSERT OR IGNORE INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [entryId, label.substring(0, 50), type.toUpperCase(), tier, projectId, pos.x, pos.y, pos.z, pos.level, pos.clusterId],
  );
  autoCreateEdges(entryId, type.toUpperCase(), tier, db, projectId);
  return { id: entryId, label, type: type.toUpperCase(), tier, ...pos };
}

/**
 * Remove a node and all its edges from the graph.
 */
export function removeNode(entryId: string, db: DatabaseAdapter): void {
  db.run('DELETE FROM graph_edges WHERE source = ? OR target = ?', [entryId, entryId]);
  db.run('DELETE FROM graph_nodes WHERE entry_id = ?', [entryId]);
}

/**
 * Auto-create edges to similar-type and same-tier nodes (neighbourhood seeding).
 * Limits 3 TYPE_MATCH + 1 TIER_MATCH per new node to avoid edge explosion.
 */
export function autoCreateEdges(
  entryId: string, type: string, tier: string, db: DatabaseAdapter, projectId = '',
): void {
  const projectFilter = projectId ? ' AND project_id = ?' : '';
  const projectArgs = projectId ? [projectId] : [];
  const typeNeighbours = db.all<{ entry_id: string }>(
    `SELECT entry_id FROM graph_nodes WHERE type = ? AND entry_id != ?${projectFilter} ORDER BY RANDOM() LIMIT 3`,
    [type, entryId, ...projectArgs],
  );
  for (const row of typeNeighbours) {
    db.run(
      'INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)',
      [entryId, row.entry_id, 0.6, 'TYPE_MATCH'],
    );
  }
  const tierNeighbours = db.all<{ entry_id: string }>(
    `SELECT entry_id FROM graph_nodes WHERE tier = ? AND type != ? AND entry_id != ?${projectFilter} ORDER BY RANDOM() LIMIT 1`,
    [tier, type, entryId, ...projectArgs],
  );
  for (const row of tierNeighbours) {
    db.run(
      'INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)',
      [entryId, row.entry_id, 0.4, 'TIER_MATCH'],
    );
  }
}
