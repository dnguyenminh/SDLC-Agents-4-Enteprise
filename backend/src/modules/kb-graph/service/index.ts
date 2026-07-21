/**
 * SA4E-51 — GraphService: KB Graph operations backed by DatabaseAdapter.
 * Replaces the previous SqliteGraphService which used getAdminDb() directly,
 * causing graph_nodes/graph_edges to always write to SQLite even when
 * activeEngine=postgresql.
 *
 * Constructor accepts a DatabaseAdapter (injected by KBGraphModule) so the
 * correct engine is used at runtime.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { SpatialQueryParams, SpatialGraphResult, GraphNode } from './constants.js';

export type { GraphNode, GraphEdge, SpatialQueryParams, SpatialGraphResult } from './constants.js';
export { LEVEL_MAP, KIND_TO_TYPE } from './constants.js';
export * from './nodes.js';
export * from './spatial.js';
export * from './sync.js';

import * as nodes from './nodes.js';
import * as sync from './sync.js';
import * as spatial from './spatial.js';

/**
 * Facade over KB Graph helpers — all writes go through the injected adapter.
 * Rename: GraphService (alias SqliteGraphService kept for backward compat).
 */
export class GraphService {
  private readonly db: DatabaseAdapter;
  private readonly logger: Logger;
  private _ready = false;

  /**
   * @param db - DatabaseAdapter for graph_nodes / graph_edges
   * @param logger - Pino logger
   */
  constructor(db: DatabaseAdapter, logger: Logger) {
    this.db = db;
    this.logger = logger.child({ service: 'graph-service' });
  }

  get ready(): boolean { return this._ready; }

  /** Initialise: count existing nodes and trigger full sync if empty. */
  async initialize(): Promise<void> {
    const count = nodes.getNodeCount(this.db);
    this._ready = true;
    if (count === 0) {
      this.logger.info('Graph empty — starting full sync from all sources');
      await this.fullSync();
    } else {
      this.logger.info({ existingNodes: count }, 'Graph service ready');
    }
  }

  /**
   * Full sync from KB entries + code symbols.
   * @returns Counts of nodes and edges created plus breakdown by source type
   */
  async fullSync(): Promise<{ nodesCreated: number; edgesCreated: number; sources: Record<string, number> }> {
    const result = await sync.fullSync(this.db, this.logger);
    this._ready = true;
    return result;
  }

  /** @returns Current node count, optionally scoped to a project */
  getNodeCount(projectId?: string): number {
    return nodes.getNodeCount(this.db, projectId);
  }

  /**
   * Add a node; no-op if entry already exists.
   * @returns The inserted or existing node
   */
  addNode(entryId: string, label: string, type: string, tier: string, projectId = ''): GraphNode {
    return nodes.addNode(entryId, label, type, tier, this.db, this.logger, projectId);
  }

  /** Remove a node and all its incident edges. */
  removeNode(entryId: string): void {
    nodes.removeNode(entryId, this.db);
  }

  /** @returns Node by ID or null */
  getNode(entryId: string): GraphNode | null {
    return nodes.getNode(entryId, this.db, this.logger);
  }

  /**
   * Insert a direct graph edge between two nodes.
   * @param weight - Edge strength [0,1]
   * @param relType - Relationship label
   */
  addEdge(source: string, target: string, weight = 0.5, relType = 'RELATED_TO'): void {
    this.db.run(
      'INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)',
      [source, target, weight, relType],
    );
  }

  /** @returns All node positions (lightweight for 3D viewport load) */
  getAllPositions(projectId?: string) {
    return spatial.getAllPositions(this.db, projectId);
  }

  /** @returns Nodes + edges for current camera frustum */
  spatialQuery(params: SpatialQueryParams, projectId?: string): SpatialGraphResult {
    return spatial.spatialQuery(params, this.db, this.logger, projectId);
  }

  /**
   * Sync a pre-prepared entry list into the graph.
   * @param entries - Node descriptors to upsert
   * @param projectId - Default project ID
   */
  syncFromEntries(
    entries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string }>,
    projectId = '',
  ): { nodesCreated: number; edgesCreated: number } {
    return sync.syncFromEntries(entries, this.db, this.logger, projectId);
  }

  /** Compute Fibonacci-sphere position for a node by current graph state. */
  computePosition(index: number, type: string) {
    return nodes.computePosition(index, type, this.db);
  }

  /** Compute position by explicit group/count parameters (no DB reads). */
  computePositionByIndex(i: number, total: number, type: string, groupId: number, groupCount: number) {
    return nodes.computePositionByIndex(i, total, type, groupId, groupCount);
  }

  /** Trigger neighbourhood edge creation for an existing node. */
  autoCreateEdges(entryId: string, type: string, tier: string, projectId = ''): void {
    nodes.autoCreateEdges(entryId, type, tier, this.db, projectId);
  }

  /** Map a raw DB row to a typed GraphNode. */
  rowToNode(row: any): GraphNode {
    return nodes.rowToNode(row);
  }
}

// Backward-compat alias — existing code that imports SqliteGraphService still compiles
export { GraphService as SqliteGraphService };
