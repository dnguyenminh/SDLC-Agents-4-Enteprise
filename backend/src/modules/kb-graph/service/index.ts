/**
 * SA4E-51 — GraphService: KB Graph operations backed by DatabaseAdapter.
 * SA4E-53: updated to async API for PostgreSQL compatibility.
 * Facade (BR-18): node/spatial/sync helpers live in nodes.ts / spatial.ts /
 * sync.ts; analytics in analytics.ts; queries/merge in graph-queries.ts.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { SpatialQueryParams, SpatialGraphResult, GraphNode } from './constants.js';
import { getKbEntryCount } from '../../../admin/admin-db.js';

export type { GraphNode, GraphEdge, SpatialQueryParams, SpatialGraphResult } from './constants.js';
export { LEVEL_MAP, KIND_TO_TYPE, graphTypeForKind } from './constants.js';
export * from './nodes.js';
export * from './spatial.js';
export * from './sync.js';

import * as nodes from './nodes.js';
import * as sync from './sync.js';
import * as spatial from './spatial.js';
import { detectCommunities, computePageRank } from './analytics.js';
import {
  searchNodes as searchNodesImpl, getEdgesForNodeIds as getEdgesImpl,
  getGraphStats as getStatsImpl, mergeGraph as mergeGraphImpl,
  crossSync as crossSyncImpl, removeCrossEdges as removeCrossEdgesImpl,
} from './graph-queries.js';

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

  /** Initialise: count existing nodes and trigger full sync if empty. SA4E-53: async. */
  async initialize(): Promise<void> {
    const graphCount = await nodes.getNodeCount(this.db);
    this._ready = true;
    if (graphCount === 0) {
      const kbCount = await getKbEntryCount();
      if (kbCount > 0) {
        // KB has entries but graph is empty — sync immediately
        this.logger.info({ kbCount }, 'Graph empty but KB has entries — starting full sync');
        await this.fullSync();
      } else {
        // Both empty at startup — schedule a delayed sync to catch documents indexed after startup
        this.logger.info('Graph and KB both empty at startup — scheduling delayed sync in 60s');
        setTimeout(() => {
          this.fullSync().catch(err =>
            this.logger.warn({ err }, 'Delayed graph sync failed'),
          );
        }, 60_000);
      }
    } else {
      this.logger.info({ existingNodes: graphCount }, 'Graph service ready');
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

  /** @returns Current node count, optionally scoped to a project. SA4E-53: async. */
  async getNodeCount(projectId?: string): Promise<number> {
    return nodes.getNodeCount(this.db, projectId);
  }

  /**
   * Add a node; no-op if entry already exists. SA4E-53: async.
   * @returns The inserted or existing node
   */
  async addNode(entryId: string, label: string, type: string, tier: string, projectId = ''): Promise<GraphNode> {
    return nodes.addNode(entryId, label, type, tier, this.db, this.logger, projectId);
  }

  /** Remove a node and all its incident edges. SA4E-53: async. */
  async removeNode(entryId: string): Promise<void> {
    return nodes.removeNode(entryId, this.db);
  }

  /** @returns Node by ID or null. SA4E-53: async. */
  async getNode(entryId: string): Promise<GraphNode | null> {
    return nodes.getNode(entryId, this.db, this.logger);
  }

  /**
   * Insert a direct graph edge between two nodes. SA4E-53: async.
   * @param weight - Edge strength [0,1]
   * @param relType - Relationship label
   */
  async addEdge(source: string, target: string, weight = 0.5, relType = 'RELATED_TO'): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
      [source, target, weight, relType],
    );
  }

  /** @returns All node positions (lightweight for 3D viewport load). SA4E-53: async. */
  async getAllPositions(projectId?: string) {
    return spatial.getAllPositions(this.db, projectId);
  }

  /** @returns Nodes + edges for current camera frustum. SA4E-53: async. */
  async spatialQuery(params: SpatialQueryParams, projectId?: string): Promise<SpatialGraphResult> {
    return spatial.spatialQuery(params, this.db, this.logger, projectId);
  }

  /**
   * Sync a pre-prepared entry list into the graph.
   * @param entries - Node descriptors to upsert
   * @param projectId - Default project ID
   */
  async syncFromEntries(
    entries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string }>,
    projectId = '',
  ): Promise<{ nodesCreated: number; edgesCreated: number }> {
    return await sync.syncFromEntries(entries, this.db, this.logger, projectId);
  }

  /** Compute Fibonacci-sphere position for a node by current graph state. SA4E-53: async. */
  async computePosition(index: number, type: string) {
    return nodes.computePosition(index, type, this.db);
  }

  /** Compute position by explicit group/count parameters (no DB reads). */
  computePositionByIndex(i: number, total: number, type: string, groupId: number, groupCount: number) {
    return nodes.computePositionByIndex(i, total, type, groupId, groupCount);
  }

  /** Trigger neighbourhood edge creation for an existing node. SA4E-53: async. */
  async autoCreateEdges(entryId: string, type: string, tier: string, projectId = ''): Promise<void> {
    return nodes.autoCreateEdges(entryId, type, tier, this.db, projectId);
  }

  /** Map a raw DB row to a typed GraphNode. */
  rowToNode(row: any): GraphNode {
    return nodes.rowToNode(row);
  }

  /** Search graph_nodes by label, type, or tier. SA4E-53: async. */
  async searchNodes(
    query?: string, type?: string, tier?: string,
    limit = 20, projectId?: string,
  ): Promise<GraphNode[]> {
    return searchNodesImpl(this.db, query, type, tier, limit, projectId);
  }

  /** Get edges where either endpoint is in the given node ID set. */
  async getEdgesForNodeIds(
    ids: string[], limit = 200,
  ): Promise<Array<{ source: string; target: string; weight: number; type: string }>> {
    return getEdgesImpl(this.db, ids, limit);
  }

  /** Community detection via label propagation — see analytics.ts. */
  async detectCommunities(
    maxIterations = 20, minClusterSize = 2,
  ): Promise<Array<{ community: string; nodeCount: number; nodeIds: string[]; avgWeight: number }>> {
    return detectCommunities(this.db, maxIterations, minClusterSize);
  }

  /** Simplified PageRank — see analytics.ts. */
  async computePageRank(
    dampingFactor = 0.85, maxIterations = 20, convergence = 0.001, topN = 20,
  ): Promise<Array<{ nodeId: string; rank: number; label: string; type: string }>> {
    return computePageRank(this.db, dampingFactor, maxIterations, convergence, topN);
  }

  /** Get graph summary statistics. */
  async getGraphStats(): Promise<{
    nodeCount: number; edgeCount: number; density: number;
    typeDistribution: Record<string, number>;
  }> {
    return getStatsImpl(this.db);
  }

  /** Multi-agent graph merge — see graph-queries.ts. */
  async mergeGraph(
    projectIds: string[],
  ): Promise<{
    nodes: Array<any>;
    edges: Array<any>;
    stats: { totalNodes: number; totalEdges: number; projectCount: number; conflicts: number };
  }> {
    return mergeGraphImpl(this.db, projectIds);
  }

  /** Cross-tenant sync — see graph-queries.ts. */
  async crossSync(
    sourceProjectId: string,
    targetProjectId: string,
  ): Promise<{ edgesCreated: number; matches: number; sourceNodes: number; targetNodes: number }> {
    return crossSyncImpl(this.db, this.logger, sourceProjectId, targetProjectId);
  }

  /** Remove all cross-tenant edges between two projects. */
  async removeCrossEdges(projectIdA: string, projectIdB: string): Promise<{ removed: number }> {
    return removeCrossEdgesImpl(this.db, projectIdA, projectIdB);
  }
}

// Backward-compat alias — existing code that imports SqliteGraphService still compiles
export { GraphService as SqliteGraphService };
