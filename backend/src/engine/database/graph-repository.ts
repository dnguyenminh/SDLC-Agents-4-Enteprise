/**
 * KSA-153: Graph Repository — CRUD operations for the code relationship graph.
 * SA4E-41: every read is tenant-scoped and fail-closed via CodeIntelIsolation.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 * Note: prepare() has no async equivalent — replaced with inline runAsync/allAsync calls.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export interface CallerResult {
  name: string;
  kind: string;
  file_path: string;
  def_line: number;
  call_line: number;
  parameters: string | null;
  is_async: number;
  id: number;
}

export interface CalleeResult {
  name: string;
  call_line: number;
  metadata: string | null;
  kind: string | null;
  file_path: string | null;
  def_line: number | null;
}

export interface RelationshipInput {
  sourceSymbolId: number;
  targetSymbol: string;
  targetSymbolId?: number | null;
  kind: string;
  filePath: string;
  line: number;
  metadata?: Record<string, unknown> | null;
}

export class GraphRepository {
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;
  private readonly scopeClause: string;
  private readonly scopeParams: readonly unknown[];

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    const scope = buildCodeScopeFilter(projectId, 's');
    this.scopeClause = scope.clause;
    this.scopeParams = scope.params;
  }

  /** Insert a batch of relationships within a transaction. SA4E-53: async. */
  async insertRelationships(relationships: RelationshipInput[]): Promise<void> {
    await this.adapter.transactionAsync(async () => {
      for (const rel of relationships) {
        await this.adapter.runAsync(
          `INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            rel.sourceSymbolId,
            rel.targetSymbol,
            rel.targetSymbolId ?? null,
            rel.kind,
            rel.filePath,
            rel.line,
            rel.metadata ? JSON.stringify(rel.metadata) : null,
          ],
        );
      }
    });
  }

  /** Delete all relationships originating from a file (optionally tenant-scoped). SA4E-53: async. */
  async deleteFileRelationships(filePath: string, projectId?: string): Promise<void> {
    const pid = projectId ?? this.projectId;
    if (pid) {
      await this.adapter.runAsync(
        'DELETE FROM relationships WHERE file_path = ? AND project_id = ?',
        [filePath, pid],
      );
      return;
    }
    await this.adapter.runAsync('DELETE FROM relationships WHERE file_path = ?', [filePath]);
  }

  /** Find direct callers of a symbol by name (tenant-scoped, fail-closed). SA4E-53: async. */
  async findCallers(symbolName: string, kind = 'calls', limit = 20): Promise<CallerResult[]> {
    return this.adapter.allAsync<CallerResult>(`
      SELECT s.name, s.kind, f.relative_path as file_path, s.start_line as def_line, r.line as call_line,
             s.parent_symbol as parameters, s.visibility as is_async, s.id
      FROM relationships r
      JOIN symbols s ON s.id = r.source_symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE r.target_symbol = ? AND r.kind = ? AND ${this.scopeClause}
      ORDER BY f.relative_path, r.line
      LIMIT ?
    `, [symbolName, kind, ...this.scopeParams, limit]);
  }

  /** Find direct callees of a symbol by ID (tenant-scoped, fail-closed). SA4E-53: async. */
  async findCallees(symbolId: number, kind = 'calls', limit = 20): Promise<CalleeResult[]> {
    return this.adapter.allAsync<CalleeResult>(`
      SELECT r.target_symbol as name, r.line as call_line, r.metadata,
             ts.kind, tf.relative_path as file_path, ts.start_line as def_line
      FROM relationships r
      JOIN symbols s ON s.id = r.source_symbol_id
      LEFT JOIN symbols ts ON ts.id = r.target_symbol_id
      LEFT JOIN files tf ON tf.id = ts.file_id
      WHERE r.source_symbol_id = ? AND r.kind = ? AND ${this.scopeClause}
      ORDER BY r.line
      LIMIT ?
    `, [symbolId, kind, ...this.scopeParams, limit]);
  }

  /**
   * Resolve target_symbol_id for unresolved relationships (batch), tenant-scoped.
   * SA4E-53: async — replaces prepare() calls with inline async queries.
   */
  async resolveTargets(batchSize = 1000, projectId?: string): Promise<number> {
    const pid = projectId ?? this.projectId;
    const unresolved = await (pid
      ? this.adapter.allAsync<{ id: number; target_symbol: string }>(
          'SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL AND r.project_id = ? LIMIT ?',
          [pid, batchSize],
        )
      : this.adapter.allAsync<{ id: number; target_symbol: string }>(
          'SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL LIMIT ?',
          [batchSize],
        ));

    let resolved = 0;

    await this.adapter.transactionAsync(async () => {
      for (const row of unresolved) {
        const target = await (pid
          ? this.adapter.getAsync<{ id: number }>(
              'SELECT id FROM symbols WHERE name = ? AND project_id = ? LIMIT 1',
              [row.target_symbol, pid],
            )
          : this.adapter.getAsync<{ id: number }>(
              'SELECT id FROM symbols WHERE name = ? LIMIT 1',
              [row.target_symbol],
            ));
        if (target) {
          await this.adapter.runAsync(
            'UPDATE relationships SET target_symbol_id = ? WHERE id = ?',
            [target.id, row.id],
          );
          resolved++;
        }
      }
    });

    return resolved;
  }

  /** Get total relationship count (tenant-scoped, fail-closed). SA4E-53: async. */
  async getRelationshipCount(): Promise<number> {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    const row = await this.adapter.getAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM relationships WHERE ${scope.clause}`,
      [...scope.params],
    );
    return row?.count ?? 0;
  }

  /** Get relationship statistics by kind (tenant-scoped, fail-closed). SA4E-53: async. */
  async getStats(): Promise<{ kind: string; count: number }[]> {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    return this.adapter.allAsync<{ kind: string; count: number }>(
      `SELECT kind, COUNT(*) as count
       FROM relationships
       WHERE ${scope.clause}
       GROUP BY kind
       ORDER BY count DESC`,
      [...scope.params],
    );
  }
}
