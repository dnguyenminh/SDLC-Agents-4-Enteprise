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
import { graphTypeForKind } from '../../modules/kb-graph/service/constants.js';
import { extractAndInsertCodeEdges } from './code-edge-extractor.js';
import type { Logger } from 'pino';

interface CodeSymbolRow {
  id: number;
  name: string;
  kind: string;
  relative_path: string | null;
}

const CODE_KINDS = ['class', 'interface', 'function', 'method', 'enum', 'type', 'constructor', 'property', 'variable'];

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
      // SA4E-91: Extract and insert code edges (IMPORTS, CALLS, EXTENDS)
      await this.syncCodeEdges(projectId);
      // SA4E-99: Queue CODE_ENRICHMENT tasks async (fire-and-forget, non-blocking)
      this.queueCodeSummaryTasks(projectId, symbols).catch(err =>
        this.log.warn({ err }, '[graph-sync] Code enrichment queue failed (non-fatal)'));
    } catch (err) {
      // Non-fatal: visualization projection must never fail the index run.
      this.log.error({ err }, `[graph-sync] Failed to sync code nodes for ${projectId}`);
    }
  }

  /**
   * SA4E-99: Queue CODE_ENRICHMENT tasks for symbols that have body text.
   * Reads body from body_embeddings, creates pending_tasks for LLM summarization.
   * Runs async — does NOT block code indexing.
   */
  private async queueCodeSummaryTasks(projectId: string, symbols: CodeSymbolRow[]): Promise<void> {
    // Only queue for exported or complex symbols (top priority)
    const candidates = symbols.slice(0, 200); // Cap at 200 per sync to avoid queue flood
    const now = new Date().toISOString();
    let queued = 0;

    for (const s of candidates) {
      // Read body text from body_embeddings
      const bodyRow = await this.indexAdapter.getAsync<{ embedding: Buffer; token_count: number }>(
        'SELECT embedding, token_count FROM body_embeddings WHERE symbol_id = ? AND chunk_index = 0',
        [s.id],
      );
      if (!bodyRow || bodyRow.token_count < 10) continue;

      const bodyText = bodyRow.embedding.toString('utf-8');
      if (bodyText.length < 50) continue;

      // Read signature from symbols table
      const symRow = await this.indexAdapter.getAsync<{ signature: string | null }>(
        'SELECT signature FROM symbols WHERE id = ?', [s.id],
      );

      const payload = {
        symbol_id: s.id,
        name: s.name,
        kind: s.kind,
        signature: symRow?.signature || null,
        body: bodyText.slice(0, 4000),
        file_path: s.relative_path || '',
      };

      // Insert into pending_tasks (use admin adapter — same DB as graph_nodes)
      // Temporarily disable FK for CODE_ENRICHMENT (entry_id=symbolId, not a knowledge_entries ref)
      try {
        await this.adminAdapter.runAsync('PRAGMA foreign_keys = OFF', []);
        await this.adminAdapter.runAsync(
          `INSERT INTO pending_tasks (task_type, entry_id, payload, status, retry_count, max_retries, created_at)
           VALUES ('CODE_ENRICHMENT', 0, ?, 'PENDING', 0, 2, ?)`,
          [JSON.stringify(payload), now],
        );
        await this.adminAdapter.runAsync('PRAGMA foreign_keys = ON', []);
        queued++;
      } catch {
        try { await this.adminAdapter.runAsync('PRAGMA foreign_keys = ON', []); } catch { /* restore FK constraint */ }
      }
    }

    if (queued > 0) {
      this.log.info(`[graph-sync] Queued ${queued} CODE_ENRICHMENT tasks for project ${projectId}`);
    }
  }

  /** SA4E-91: Extract code relationships into graph_edges (non-fatal). */
  private async syncCodeEdges(projectId: string): Promise<void> {
    try {
      const count = await extractAndInsertCodeEdges(
        this.indexAdapter, this.adminAdapter, projectId, this.log,
      );
      if (count > 0) {
        this.log.info(`[graph-sync] Inserted ${count} code edges for project ${projectId}`);
      }
    } catch (err) {
      this.log.warn({ err }, `[graph-sync] Code edge extraction failed (non-fatal)`);
    }
  }

  private async readTopSymbols(projectId: string): Promise<CodeSymbolRow[]> {
    // Standard code kinds + all pega_* kinds (pattern match)
    const placeholders = CODE_KINDS.map(() => '?').join(',');
    return this.indexAdapter.allAsync<CodeSymbolRow>(
      `SELECT s.id, s.name, s.kind, f.relative_path
       FROM symbols s JOIN files f ON s.file_id = f.id
       WHERE s.project_id = ? AND (s.kind IN (${placeholders}) OR s.kind LIKE 'pega_%')
       ORDER BY (s.is_exported = 1) DESC, s.complexity DESC`,
      [projectId, ...CODE_KINDS],
    );
  }

  private async replaceCodeNodes(projectId: string, symbols: CodeSymbolRow[]): Promise<void> {
    // Delete old code nodes — avoid transactionAsync which can cause pool issues with nested awaits
    await this.adminAdapter.runAsync(
      "DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%'",
      [projectId],
    );

    // SA4E-97: Group symbols by type for cluster-based positioning
    const byType = new Map<string, CodeSymbolRow[]>();
    for (const s of symbols) {
      const nodeType = graphTypeForKind(s.kind);
      if (!byType.has(nodeType)) byType.set(nodeType, []);
      byType.get(nodeType)!.push(s);
    }
    const allTypes = Array.from(byType.keys());
    const totalGroups = allTypes.length;

    const sql = this.adminDialect.insertIgnore('graph_nodes',
      ['entry_id','label','type','tier','project_id','x','y','z','level','cluster_id'], 'entry_id');

    for (let gi = 0; gi < allTypes.length; gi++) {
      const nodeType = allTypes[gi];
      const group = byType.get(nodeType)!;
      for (let i = 0; i < group.length; i++) {
        const s = group[i];
        const pos = fibonacciSphereGrouped(i, group.length, gi, totalGroups, nodeType);
        await this.adminAdapter.runAsync(sql, [
          `code:${s.id}`, this.toLabel(s), nodeType, 'CODE',
          projectId, pos.x, pos.y, pos.z, 'micro', `code-${nodeType.toLowerCase()}`,
        ]);
      }
    }
  }

  private toLabel(s: CodeSymbolRow): string {
    const file = s.relative_path ? s.relative_path.split('/').pop() ?? '' : '';
    return `${s.name} (${file})`.substring(0, 60);
  }
}

/** Fibonacci-sphere position with type-based grouping (SA4E-97). */
function fibonacciSphereGrouped(
  index: number, groupSize: number, groupId: number, totalGroups: number, type: string,
): { x: number; y: number; z: number } {
  const golden = (1 + Math.sqrt(5)) / 2;
  // Cluster center on outer sphere
  const phi = Math.acos(1 - 2 * (groupId + 0.5) / Math.max(totalGroups, 1));
  const theta_g = 2 * Math.PI * groupId / golden;
  const sphereRadius = 800;
  const centerX = sphereRadius * Math.sin(phi) * Math.cos(theta_g);
  const centerY = sphereRadius * Math.sin(phi) * Math.sin(theta_g);
  const centerZ = sphereRadius * Math.cos(phi);
  // Spread within cluster
  const localSpread = 120;
  const theta_l = 2 * Math.PI * index / golden;
  const localR = Math.sqrt((index % 200) / 200) * localSpread;
  // Z offset by type
  const TYPE_Z: Record<string, number> = {
    CLASS: 400, INTERFACE: 350, FUNCTION: 200, METHOD: 100,
    ENUM: 300, TYPE: 250, CONSTRUCTOR: 150, CODE_ENTITY: 0,
  };
  const zOffset = TYPE_Z[type] ?? 0;
  return {
    x: Math.round((centerX + localR * Math.cos(theta_l)) * 100) / 100,
    y: Math.round((centerY + localR * Math.sin(theta_l)) * 100) / 100,
    z: Math.round((centerZ + zOffset) * 100) / 100,
  };
}
