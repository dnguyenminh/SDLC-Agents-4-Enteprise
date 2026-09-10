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

const CODE_KINDS = ['class', 'interface', 'function', 'method', 'enum', 'type', 'constructor', 'property', 'variable', 'apex_class', 'trigger', 'flow', 'sf_object', 'sf_field', 'lwc_component', 'aura_component', 'visualforce_page'];

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
    } catch (err) {
      // Non-fatal: visualization projection must never fail the index run.
      this.log.error({ err }, `[graph-sync] Failed to sync code nodes for ${projectId}`);
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
    APEX_CLASS: 450, TRIGGER: 440, FLOW: 420, SF_OBJECT: 410,
    SF_FIELD: 390, LWC_COMPONENT: 430, AURA_COMPONENT: 425, VISUALFORCE_PAGE: 415,
  };
  const zOffset = TYPE_Z[type] ?? 0;
  return {
    x: Math.round((centerX + localR * Math.cos(theta_l)) * 100) / 100,
    y: Math.round((centerY + localR * Math.sin(theta_l)) * 100) / 100,
    z: Math.round((centerZ + zOffset) * 100) / 100,
  };
}
