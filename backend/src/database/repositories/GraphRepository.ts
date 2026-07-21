/**
 * SA4E-50 — GraphRepository: encapsulates graph_nodes and graph_edges queries.
 * Centralizes duplicated count logic from analytics.ts + kb-graph-spatial.ts.
 * Implements: UC-03, UC-06, BR-04
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IGraphRepository } from './interfaces.js';
import type { GraphNodeCounts, UpsertNodeParams } from './types.js';
import { CODE_TYPES_SQL } from '../constants.js';
import { translateError } from '../errors/index.js';

/**
 * Repository for graph_nodes and graph_edges tables.
 * Uses parameterized queries for all user-supplied values.
 */
export class GraphRepository implements IGraphRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Get node counts with NULL project_id fallback.
   * If scoped count is 0, falls back to include NULL project_id nodes.
   * @param projectId - The project scope identifier
   * @returns Breakdown of total, code, and kb node counts
   * @throws RepositoryError on database failure
   */
  getNodeCounts(projectId: string): GraphNodeCounts {
    try {
      let total = this.countByWhere('project_id = ?', [projectId]);
      let code = this.countCodeByWhere('project_id = ?', [projectId]);

      // BR-04: NULL fallback for legacy/unscoped nodes
      if (total === 0) {
        total = this.countByWhere('project_id = ? OR project_id IS NULL', [projectId]);
        code = this.countCodeByWhere(
          '(project_id = ? OR project_id IS NULL)', [projectId],
        );
      }

      return { total, code, kb: total - code };
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Delete all graph nodes and edges in a single transaction.
   * @throws RepositoryError on database failure
   */
  resetGraph(): void {
    try {
      this.adapter.transaction(() => {
        this.adapter.exec('DELETE FROM graph_nodes');
        this.adapter.exec('DELETE FROM graph_edges');
      });
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Insert or replace a graph node.
   * @param params - Node data to upsert
   * @throws RepositoryError on database failure
   */
  upsertNode(params: UpsertNodeParams): void {
    try {
      this.adapter.run(
        `INSERT OR REPLACE INTO graph_nodes
         (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.entryId, params.label, params.type, params.tier,
          params.projectId, params.x ?? null, params.y ?? null,
          params.z ?? null, params.level ?? null, params.clusterId ?? null,
        ],
      );
    } catch (err) {
      throw translateError(err);
    }
  }

  /** Count graph_nodes matching a WHERE clause. */
  private countByWhere(where: string, params: unknown[]): number {
    const row = this.adapter.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM graph_nodes WHERE ${where}`, params,
    );
    return row?.cnt ?? 0;
  }

  /** Count code-type graph_nodes matching a WHERE clause. */
  private countCodeByWhere(where: string, params: unknown[]): number {
    const row = this.adapter.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM graph_nodes WHERE ${where} AND type IN (${CODE_TYPES_SQL})`,
      params,
    );
    return row?.cnt ?? 0;
  }
}
