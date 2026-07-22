/**
 * SA4E-41 — GraphSyncService (Facade).
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 *
 * Projects a tenant's code symbols into graph_nodes table in the unified DB so the
 * KB Graph visualization shows per-project code nodes. Scoped + idempotent:
 * only touches rows for the given project_id with `entry_id LIKE 'code:%'`.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import { KIND_TO_TYPE } from '../../modules/kb-graph/service/constants.js';
import type { Logger } from 'pino';

interface CodeSymbolRow {
  id: number;
  name: string;
  kind: string;
  relative_path: string | null;
}

const CODE_KINDS = ['class', 'interface', 'function', 'method', 'enum', 'type', 'constructor'];

export class GraphSyncService {
  private readonly adminDialect: DialectHelper;
  private readonly indexDialect: DialectHelper;

  constructor(
    private readonly indexAdapter: DatabaseAdapter,
    private readonly adminAdapter: DatabaseAdapter,
    private readonly log: Logger,
  ) {
    this.adminDialect = new DialectHelper(adminAdapter.getEngine());
    this.indexDialect = new DialectHelper(indexAdapter.getEngine());
    if (indexAdapter.getEngine() !== adminAdapter.getEngine()) {
      this.log.warn('[graph-sync] Index and admin adapters use different engines');
    }
  }

  /** Re-project a tenant's code symbols into graph_nodes. SA4E-53: async. */
  async syncProjectSymbols(projectId: string): Promise<void> {
    if (!projectId) return; // fail-closed
    try {
      const symbols = await this.readTopSymbols(projectId);
      await this.replaceCodeNodes(projectId, symbols);
      this.log.info(`[graph-sync] Synced ${symbols.length} code nodes for project ${projectId}`);
    } catch (err) {
      // Non-fatal: visualization projection must never fail the index run.
      this.log.error({ err }, `[graph-sync] Failed to sync code nodes for ${projectId}`);
    }
  }

  private async readTopSymbols(projectId: string): Promise<CodeSymbolRow[]> {
    const placeholders = CODE_KINDS.map(() => '?').join(',');
    return this.indexAdapter.allAsync<CodeSymbolRow>(
      `SELECT s.id, s.name, s.kind, f.relative_path
       FROM symbols s JOIN files f ON s.file_id = f.id
       WHERE s.project_id = ? AND s.kind IN (${placeholders})
       ORDER BY (s.is_exported = 1) DESC, s.complexity DESC`,
      [projectId, ...CODE_KINDS],
    );
  }

  private async replaceCodeNodes(projectId: string, symbols: CodeSymbolRow[]): Promise<void> {
    const total = Math.max(symbols.length, 1);
    // Delete old code nodes — avoid transactionAsync which can cause pool issues with nested awaits
    await this.adminAdapter.runAsync(
      "DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%'",
      [projectId],
    );
    const sql = this.adminDialect.insertIgnore('graph_nodes',
      ['entry_id','label','type','tier','project_id','x','y','z','level','cluster_id'], 'entry_id');
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      const pos = fibonacciSphere(i, total);
      const nodeType = KIND_TO_TYPE[s.kind] || 'CODE_ENTITY';
      await this.adminAdapter.runAsync(sql, [
        `code:${s.id}`, this.toLabel(s), nodeType, 'CODE',
        projectId, pos.x, pos.y, pos.z, 'micro', `code-${projectId}`,
      ]);
    }
  }

  private toLabel(s: CodeSymbolRow): string {
    const file = s.relative_path ? s.relative_path.split('/').pop() ?? '' : '';
    return `${s.name} (${file})`.substring(0, 60);
  }
}

/** Fibonacci-sphere position (mirrors kb-graph-spatial positioning). */
function fibonacciSphere(index: number, total: number): { x: number; y: number; z: number } {
  const golden = (1 + Math.sqrt(5)) / 2;
  const theta = 2 * Math.PI * index / golden;
  const phi = Math.acos(1 - 2 * (index + 0.5) / total);
  const r = 300;
  return {
    x: Math.round(r * Math.sin(phi) * Math.cos(theta) * 100) / 100,
    y: Math.round(r * Math.sin(phi) * Math.sin(theta) * 100) / 100,
    z: Math.round(r * Math.cos(phi) * 100) / 100,
  };
}
