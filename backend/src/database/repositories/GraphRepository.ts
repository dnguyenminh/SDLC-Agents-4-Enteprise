/**
 * SA4E-50 — GraphRepository: encapsulates graph_nodes and graph_edges queries.
 * SA4E-53: refactored to async DatabaseAdapter API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IGraphRepository } from './interfaces.js';
import type { GraphNodeCounts, UpsertNodeParams } from './types.js';
import { CODE_TYPES_SQL } from '../constants.js';
import { translateError } from '../errors/index.js';

export class GraphRepository implements IGraphRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async getNodeCounts(projectId: string): Promise<GraphNodeCounts> {
    try {
      let total = await this.countByWhere('project_id = $1', [projectId]);
      let code = await this.countCodeByWhere('project_id = $1', [projectId]);

      if (total === 0) {
        total = await this.countByWhere('project_id = $1 OR project_id IS NULL', [projectId]);
        code = await this.countCodeByWhere('(project_id = $1 OR project_id IS NULL)', [projectId]);
      }

      return { total, code, kb: total - code };
    } catch (err) {
      throw translateError(err);
    }
  }

  async resetGraph(): Promise<void> {
    try {
      await this.adapter.transactionAsync(async () => {
        await this.adapter.execAsync('DELETE FROM graph_nodes');
        await this.adapter.execAsync('DELETE FROM graph_edges');
      });
    } catch (err) {
      throw translateError(err);
    }
  }

  async upsertNode(params: UpsertNodeParams): Promise<void> {
    try {
      const engine = this.adapter.getEngine();
      if (engine === 'sqlite') {
        await this.adapter.runAsync(
          `INSERT OR REPLACE INTO graph_nodes
           (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [params.entryId, params.label, params.type, params.tier,
           params.projectId, params.x ?? null, params.y ?? null,
           params.z ?? null, params.level ?? null, params.clusterId ?? null],
        );
      } else {
        await this.adapter.runAsync(
          `INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (entry_id) DO UPDATE SET
             label = EXCLUDED.label, type = EXCLUDED.type, tier = EXCLUDED.tier,
             project_id = EXCLUDED.project_id, x = EXCLUDED.x, y = EXCLUDED.y,
             z = EXCLUDED.z, level = EXCLUDED.level, cluster_id = EXCLUDED.cluster_id`,
          [params.entryId, params.label, params.type, params.tier,
           params.projectId, params.x ?? null, params.y ?? null,
           params.z ?? null, params.level ?? null, params.clusterId ?? null],
        );
      }
    } catch (err) {
      throw translateError(err);
    }
  }

  async registerProject(projectId: string, displayName: string, workspacePath: string, createdBy = ''): Promise<void> {
    try {
      const engine = this.adapter.getEngine();
      const ts = engine === 'sqlite' ? `datetime('now')` : 'current_timestamp';
      if (engine === 'sqlite') {
        await this.adapter.runAsync(
          `INSERT INTO project_registry (project_id, display_name, workspace_path, created_by, last_seen)
           VALUES (?, ?, ?, ?, ${ts})
           ON CONFLICT(project_id) DO UPDATE SET display_name = excluded.display_name, workspace_path = excluded.workspace_path, last_seen = ${ts}`,
          [projectId, displayName, workspacePath, createdBy],
        );
      } else {
        await this.adapter.runAsync(
          `INSERT INTO project_registry (project_id, display_name, workspace_path, created_by, last_seen)
           VALUES ($1, $2, $3, $4, ${ts})
           ON CONFLICT(project_id) DO UPDATE SET display_name = EXCLUDED.display_name, workspace_path = EXCLUDED.workspace_path, last_seen = ${ts}`,
          [projectId, displayName, workspacePath, createdBy],
        );
      }
    } catch (err) {
      throw translateError(err);
    }
  }

  private async countByWhere(where: string, params: unknown[]): Promise<number> {
    const row = await this.adapter.getAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM graph_nodes WHERE ${where}`, params,
    );
    return row?.cnt ?? 0;
  }

  private async countCodeByWhere(where: string, params: unknown[]): Promise<number> {
    const row = await this.adapter.getAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM graph_nodes WHERE ${where} AND type IN (${CODE_TYPES_SQL})`,
      params,
    );
    return row?.cnt ?? 0;
  }
}
