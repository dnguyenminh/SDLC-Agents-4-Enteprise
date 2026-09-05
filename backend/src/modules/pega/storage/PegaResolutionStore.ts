/**
 * PegaResolutionStore.ts — SA4E-237 (GD5). Persistence for pega_reference_resolution.
 *
 * Two-phase model:
 *   - Phase 1 (index time): stageReferences() records each rule-to-rule reference a source
 *     rule declares (from GD3 pxRuleReferences), with target FQN and status 'unresolved'.
 *     delete-by-source-then-insert keeps re-indexing idempotent (no duplicate rows).
 *   - Phase 2 (after full project index): resolvePass reads staged rows, looks up target
 *     symbols by FQN, and updates resolution_status + target_symbol_id.
 *
 * Dual-dialect (SQLite + PostgreSQL) via `?` placeholders (auto-translated by the adapter).
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** A single staged/resolved reference row. */
export interface ResolutionRow {
  id?: number;
  projectId: string;
  sourceSymbolId: number;
  sourceFqn: string;
  refKind: string;
  refPath: string;
  targetSymbolId: number | null;
  targetFqn: string;
  resolutionStatus: 'resolved' | 'external' | 'unresolved' | 'ambiguous';
  detail?: string | null;
}

/** A reference to stage (before resolution). */
export interface StagedReference {
  refKind: string;
  refPath: string;
  targetFqn: string;
}

/**
 * Data-access for the pega_reference_resolution table. Never swallows errors silently —
 * callers decide whether the pass is non-fatal.
 */
export class PegaResolutionStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Replace all rows for a source symbol with a fresh staged set (idempotent re-index).
   * Rows are inserted with status 'unresolved'; Phase 2 updates them.
   * @param projectId Tenant project id
   * @param sourceSymbolId Source symbol id
   * @param sourceFqn Source rule FQN
   * @param refs References declared by the source rule
   */
  async stageReferences(
    projectId: string,
    sourceSymbolId: number,
    sourceFqn: string,
    refs: StagedReference[],
  ): Promise<void> {
    await this.adapter.runAsync(
      'DELETE FROM pega_reference_resolution WHERE source_symbol_id = ? AND project_id = ?',
      [sourceSymbolId, projectId],
    );
    for (const ref of refs) {
      await this.adapter.runAsync(
        `INSERT INTO pega_reference_resolution
           (project_id, source_symbol_id, source_fqn, ref_kind, ref_path, target_fqn, resolution_status)
         VALUES (?, ?, ?, ?, ?, ?, 'unresolved')`,
        [projectId, sourceSymbolId, sourceFqn, ref.refKind, ref.refPath, ref.targetFqn],
      );
    }
  }

  /** Read all staged rows for a project (Phase 2 input). */
  async listByProject(projectId: string): Promise<ResolutionRow[]> {
    const rows = await this.adapter.allAsync<Record<string, unknown>>(
      `SELECT id, project_id, source_symbol_id, source_fqn, ref_kind, ref_path,
              target_symbol_id, target_fqn, resolution_status, detail
       FROM pega_reference_resolution WHERE project_id = ?`,
      [projectId],
    );
    return rows.map(mapRow);
  }

  /**
   * Update the resolution outcome of a single row.
   * @param id Row id
   * @param status Resolution status
   * @param targetSymbolId Resolved target symbol id (null when external/unresolved)
   * @param detail Human explanation
   */
  async updateResolution(
    id: number,
    status: ResolutionRow['resolutionStatus'],
    targetSymbolId: number | null,
    detail: string,
  ): Promise<void> {
    await this.adapter.runAsync(
      `UPDATE pega_reference_resolution
       SET resolution_status = ?, target_symbol_id = ?, detail = ? WHERE id = ?`,
      [status, targetSymbolId, detail, id],
    );
  }

  /** Query: what does this source symbol reference? */
  async referencesFrom(projectId: string, sourceSymbolId: number): Promise<ResolutionRow[]> {
    const rows = await this.adapter.allAsync<Record<string, unknown>>(
      `SELECT id, project_id, source_symbol_id, source_fqn, ref_kind, ref_path,
              target_symbol_id, target_fqn, resolution_status, detail
       FROM pega_reference_resolution WHERE project_id = ? AND source_symbol_id = ?`,
      [projectId, sourceSymbolId],
    );
    return rows.map(mapRow);
  }

  /** Query: who depends on this target symbol id? */
  async dependentsOf(projectId: string, targetSymbolId: number): Promise<ResolutionRow[]> {
    const rows = await this.adapter.allAsync<Record<string, unknown>>(
      `SELECT id, project_id, source_symbol_id, source_fqn, ref_kind, ref_path,
              target_symbol_id, target_fqn, resolution_status, detail
       FROM pega_reference_resolution WHERE project_id = ? AND target_symbol_id = ?`,
      [projectId, targetSymbolId],
    );
    return rows.map(mapRow);
  }

  /** Query: all references with a given status (e.g. 'unresolved', 'ambiguous'). */
  async byStatus(projectId: string, status: ResolutionRow['resolutionStatus']): Promise<ResolutionRow[]> {
    const rows = await this.adapter.allAsync<Record<string, unknown>>(
      `SELECT id, project_id, source_symbol_id, source_fqn, ref_kind, ref_path,
              target_symbol_id, target_fqn, resolution_status, detail
       FROM pega_reference_resolution WHERE project_id = ? AND resolution_status = ?`,
      [projectId, status],
    );
    return rows.map(mapRow);
  }
}

/** Map a raw DB row (snake_case) to the typed ResolutionRow. */
function mapRow(r: Record<string, unknown>): ResolutionRow {
  return {
    id: Number(r.id),
    projectId: String(r.project_id),
    sourceSymbolId: Number(r.source_symbol_id),
    sourceFqn: String(r.source_fqn),
    refKind: String(r.ref_kind),
    refPath: String(r.ref_path),
    targetSymbolId: r.target_symbol_id == null ? null : Number(r.target_symbol_id),
    targetFqn: String(r.target_fqn),
    resolutionStatus: String(r.resolution_status) as ResolutionRow['resolutionStatus'],
    detail: r.detail == null ? null : String(r.detail),
  };
}
