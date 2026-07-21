/**
 * Node CRUD operations and position math for KB Graph.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import type { GraphNode } from './constants.js';
import { LEVEL_MAP } from './constants.js';

const TYPE_Z_OFFSET: Record<string, number> = {
  REQUIREMENT: 0, ARCHITECTURE: 150, PROCEDURE: 300,
  CONTEXT: 50, DECISION: 200, DOCUMENT: 100,
  LESSON_LEARNED: -100, ERROR_PATTERN: -150,
  CLASS: 500, INTERFACE: 450, FUNCTION: 600, METHOD: 550,
  TYPE: 480, CONSTRUCTOR: 520, ENUM: 460, CONSTANT: 400, VARIABLE: 380,
  CODE_ENTITY: 470,
};

export function computePositionByIndex(i: number, total: number, type: string, groupId: number, groupCount: number) {
  const n = Math.max(total, 1);
  const level = LEVEL_MAP[type.toUpperCase()] ?? 2;
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
    level, clusterId: `cluster-${groupId}`,
  };
}

export function computePosition(index: number, type: string, db: Database.Database) {
  const typeRows = db.prepare('SELECT DISTINCT type FROM graph_nodes').all() as any[];
  const groups = new Map<string, number>();
  let gc = 0;
  for (const r of typeRows) groups.set(r.type, gc++);
  if (!groups.has(type.toUpperCase())) groups.set(type.toUpperCase(), gc++);
  const nodeCount = (db.prepare('SELECT COUNT(*) as cnt FROM graph_nodes').get() as any).cnt;
  return computePositionByIndex(index, nodeCount + 1, type, groups.get(type.toUpperCase()) || 0, gc || 1);
}

export function rowToNode(row: any): GraphNode {
  return { id: row.entry_id, label: row.label, type: row.type, tier: row.tier, x: row.x, y: row.y, z: row.z, level: row.level, clusterId: row.cluster_id };
}

export function getNode(entryId: string, db: Database.Database, logger: Logger): GraphNode | null {
  const row = db.prepare('SELECT * FROM graph_nodes WHERE entry_id = ?').get(entryId) as any;
  if (!row) return null;
  return rowToNode(row);
}

export function getNodeCount(db: Database.Database, projectId?: string): number {
  if (projectId) {
    return (db.prepare('SELECT COUNT(*) as cnt FROM graph_nodes WHERE project_id = ?').get(projectId) as any).cnt;
  }
  return (db.prepare('SELECT COUNT(*) as cnt FROM graph_nodes').get() as any).cnt;
}

export function addNode(entryId: string, label: string, type: string, tier: string, db: Database.Database, logger: Logger, projectId = ''): GraphNode {
  const existing = db.prepare('SELECT entry_id FROM graph_nodes WHERE entry_id = ?').get(entryId);
  if (existing) return getNode(entryId, db, logger)!;
  const count = getNodeCount(db);
  const pos = computePosition(count, type, db);
  db.prepare(`INSERT OR IGNORE INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(entryId, label.substring(0, 50), type.toUpperCase(), tier, projectId, pos.x, pos.y, pos.z, pos.level, pos.clusterId);
  autoCreateEdges(entryId, type.toUpperCase(), tier, db, projectId);
  return { id: entryId, label, type: type.toUpperCase(), tier, ...pos };
}

export function removeNode(entryId: string, db: Database.Database): void {
  db.prepare('DELETE FROM graph_edges WHERE source = ? OR target = ?').run(entryId, entryId);
  db.prepare('DELETE FROM graph_nodes WHERE entry_id = ?').run(entryId);
}

export function autoCreateEdges(entryId: string, type: string, tier: string, db: Database.Database, projectId = ''): void {
  const projectFilter = projectId ? ' AND project_id = ?' : '';
  const projectArgs = projectId ? [projectId] : [];
  for (const row of db.prepare(`SELECT entry_id FROM graph_nodes WHERE type = ? AND entry_id != ?${projectFilter} ORDER BY RANDOM() LIMIT 3`).all(type, entryId, ...projectArgs) as any[]) {
    db.prepare('INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)').run(entryId, row.entry_id, 0.6, 'TYPE_MATCH');
  }
  for (const row of db.prepare(`SELECT entry_id FROM graph_nodes WHERE tier = ? AND type != ? AND entry_id != ?${projectFilter} ORDER BY RANDOM() LIMIT 1`).all(tier, type, entryId, ...projectArgs) as any[]) {
    db.prepare('INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)').run(entryId, row.entry_id, 0.4, 'TIER_MATCH');
  }
}
