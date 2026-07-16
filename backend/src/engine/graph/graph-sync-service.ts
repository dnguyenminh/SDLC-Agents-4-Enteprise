/**
 * SA4E-41 — GraphSyncService (Facade).
 *
 * Projects a tenant's code symbols (index.db) into admin.db `graph_nodes` so the
 * KB Graph visualization shows per-project code nodes. Scoped + idempotent:
 * only touches rows for the given project_id with `entry_id LIKE 'code:%'`.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';

interface CodeSymbolRow {
  id: number;
  name: string;
  kind: string;
  relative_path: string | null;
}

const CODE_KINDS = ['class', 'interface', 'function', 'method', 'enum', 'type', 'constructor'];

export class GraphSyncService {
  constructor(
    private readonly indexDb: Database.Database,
    private readonly adminDb: Database.Database,
    private readonly log: Logger,
  ) {}

  /** Re-project a tenant's code symbols into admin.db graph_nodes (bounded). */
  syncProjectSymbols(projectId: string, limit = 2000): void {
    if (!projectId) return; // fail-closed
    try {
      const symbols = this.readTopSymbols(projectId, limit);
      this.replaceCodeNodes(projectId, symbols);
      this.log.error(`[graph-sync] Synced ${symbols.length} code nodes for project ${projectId}`);
    } catch (err) {
      // Non-fatal: visualization projection must never fail the index run.
      this.log.error({ err }, `[graph-sync] Failed to sync code nodes for ${projectId}`);
    }
  }

  private readTopSymbols(projectId: string, limit: number): CodeSymbolRow[] {
    const placeholders = CODE_KINDS.map(() => '?').join(',');
    return this.indexDb.prepare(
      `SELECT s.id, s.name, s.kind, f.relative_path
       FROM symbols s JOIN files f ON s.file_id = f.id
       WHERE s.project_id = ? AND s.kind IN (${placeholders})
       ORDER BY (s.is_exported = 1) DESC, s.complexity DESC
       LIMIT ?`
    ).all(projectId, ...CODE_KINDS, limit) as CodeSymbolRow[];
  }

  private replaceCodeNodes(projectId: string, symbols: CodeSymbolRow[]): void {
    const del = this.adminDb.prepare(
      "DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%'"
    );
    const ins = this.adminDb.prepare(
      `INSERT OR IGNORE INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id)
       VALUES (?, ?, 'CODE_ENTITY', 'CODE', ?, ?, ?, ?, 'micro', ?)`
    );
    const total = Math.max(symbols.length, 1);
    const tx = this.adminDb.transaction(() => {
      del.run(projectId);
      symbols.forEach((s, i) => {
        const pos = fibonacciSphere(i, total);
        ins.run(`code:${s.id}`, this.toLabel(s), projectId, pos.x, pos.y, pos.z, `code-${projectId}`);
      });
    });
    tx();
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
