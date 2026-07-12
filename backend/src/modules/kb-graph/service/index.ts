/**
 * SqliteGraphService — Embedded graph layer using SQLite for KB Graph visualization.
 *
 * Zero external dependencies — uses the existing admin.db with graph_nodes + graph_edges tables.
 * Provides spatial bounding-box queries for progressive 3D loading.
 * Syncs BOTH knowledge_entries (Documents) AND code symbols from index.db.
 */

import type { Logger } from 'pino';
import { getAdminDb } from '../../../admin/admin-db.js';
import type { SpatialQueryParams, SpatialGraphResult, GraphNode } from './constants.js';
export type { GraphNode, GraphEdge, SpatialQueryParams, SpatialGraphResult } from './constants.js';
export { LEVEL_MAP, KIND_TO_TYPE } from './constants.js';
export * from './nodes.js';
export * from './spatial.js';
export * from './sync.js';

import * as nodes from './nodes.js';
import * as sync from './sync.js';
import * as spatial from './spatial.js';

export class SqliteGraphService {
  private logger: Logger;
  private _ready = false;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'sqlite-graph' });
  }

  get ready(): boolean { return this._ready; }

  initialize(): void {
    const db = getAdminDb();
    const count = nodes.getNodeCount(db);
    this._ready = true;
    if (count === 0) {
      this.logger.info('Graph empty — starting full sync from all sources');
      this.fullSync();
    } else {
      this.logger.info({ existingNodes: nodes.getNodeCount(db) }, 'SQLite graph service ready');
    }
  }

  fullSync(): { nodesCreated: number; edgesCreated: number; sources: Record<string, number> } {
    const result = sync.fullSync(this.logger);
    this._ready = true;
    return result;
  }

  getNodeCount(): number {
    return nodes.getNodeCount(getAdminDb());
  }

  addNode(entryId: string, label: string, type: string, tier: string): GraphNode {
    return nodes.addNode(entryId, label, type, tier, getAdminDb(), this.logger);
  }

  removeNode(entryId: string): void {
    nodes.removeNode(entryId, getAdminDb());
  }

  getNode(entryId: string): GraphNode | null {
    return nodes.getNode(entryId, getAdminDb(), this.logger);
  }

  addEdge(source: string, target: string, weight = 0.5, relType = 'RELATED_TO'): void {
    getAdminDb().prepare('INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)').run(source, target, weight, relType);
  }

  getAllPositions(): { nodes: { id: string; x: number; y: number; z: number; type: string; tier: string; label: string }[]; total: number } {
    return spatial.getAllPositions(getAdminDb());
  }

  spatialQuery(params: SpatialQueryParams): SpatialGraphResult {
    return spatial.spatialQuery(params, getAdminDb(), this.logger);
  }

  syncFromEntries(entries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number }>): { nodesCreated: number; edgesCreated: number } {
    return sync.syncFromEntries(entries, getAdminDb(), this.logger);
  }

  computePosition(index: number, type: string) {
    return nodes.computePosition(index, type, getAdminDb());
  }

  computePositionByIndex(i: number, total: number, type: string, groupId: number, groupCount: number) {
    return nodes.computePositionByIndex(i, total, type, groupId, groupCount);
  }

  autoCreateEdges(entryId: string, type: string, tier: string): void {
    nodes.autoCreateEdges(entryId, type, tier, getAdminDb());
  }

  rowToNode(row: any): GraphNode {
    return nodes.rowToNode(row);
  }
}
