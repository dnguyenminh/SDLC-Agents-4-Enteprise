/**
 * KSA-153: Graph Repository — CRUD operations for the code relationship graph.
 * Provides prepared-statement-based access to the relationships table.
 * SA4E-41: every read is tenant-scoped and fail-closed via CodeIntelIsolation.
 */

import type { DatabaseAdapter, PreparedStatement } from '../../database/adapters/DatabaseAdapter.js';
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
  private scopeParams: readonly unknown[];
  private stmts!: {
    insertRelationship: PreparedStatement;
    deleteFileRelationships: PreparedStatement;
    findCallers: PreparedStatement;
    findCallees: PreparedStatement;
    resolveTarget: PreparedStatement;
    countRelationships: PreparedStatement;
  };

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.scopeParams = buildCodeScopeFilter(projectId, 's').params;
    this.prepareStatements();
  }

  /** Insert a batch of relationships within a transaction. */
  insertRelationships(relationships: RelationshipInput[]): void {
    this.adapter.transaction(() => {
      for (const rel of relationships) {
        this.stmts.insertRelationship.run(
          rel.sourceSymbolId,
          rel.targetSymbol,
          rel.targetSymbolId ?? null,
          rel.kind,
          rel.filePath,
          rel.line,
          rel.metadata ? JSON.stringify(rel.metadata) : null
        );
      }
    });
  }

  /** Delete all relationships originating from a file (optionally tenant-scoped). */
  deleteFileRelationships(filePath: string, projectId?: string): void {
    const pid = projectId ?? this.projectId;
    if (pid) {
      this.adapter.run('DELETE FROM relationships WHERE file_path = ? AND project_id = ?', [filePath, pid]);
      return;
    }
    this.stmts.deleteFileRelationships.run(filePath);
  }

  /** Find direct callers of a symbol by name (tenant-scoped, fail-closed). */
  findCallers(symbolName: string, kind: string = 'calls', limit: number = 20): CallerResult[] {
    return this.stmts.findCallers.all(symbolName, kind, ...this.scopeParams, limit) as CallerResult[];
  }

  /** Find direct callees of a symbol by ID (tenant-scoped, fail-closed). */
  findCallees(symbolId: number, kind: string = 'calls', limit: number = 20): CalleeResult[] {
    return this.stmts.findCallees.all(symbolId, kind, ...this.scopeParams, limit) as CalleeResult[];
  }

  /** Resolve target_symbol_id for unresolved relationships (batch), tenant-scoped. */
  resolveTargets(batchSize: number = 1000, projectId?: string): number {
    const pid = projectId ?? this.projectId;
    const unresolved = (pid
      ? this.adapter.all<{ id: number; target_symbol: string }>('SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL AND r.project_id = ? LIMIT ?', [pid, batchSize])
      : this.adapter.all<{ id: number; target_symbol: string }>('SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL LIMIT ?', [batchSize])
    );

    let resolved = 0;
    const findTarget = pid
      ? this.adapter.prepare('SELECT id FROM symbols WHERE name = ? AND project_id = ? LIMIT 1')
      : this.adapter.prepare('SELECT id FROM symbols WHERE name = ? LIMIT 1');

    this.adapter.transaction(() => {
      for (const row of unresolved) {
        const target = (pid ? findTarget.get<{ id: number }>(row.target_symbol, pid) : findTarget.get<{ id: number }>(row.target_symbol));
        if (target) {
          this.stmts.resolveTarget.run(target.id, row.id);
          resolved++;
        }
      }
    });

    return resolved;
  }

  /** Get total relationship count (tenant-scoped, fail-closed). */
  getRelationshipCount(): number {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    const row = this.adapter.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM relationships WHERE ${scope.clause}`,
      [...scope.params],
    );
    return row?.count ?? 0;
  }

  /** Get relationship statistics by kind (tenant-scoped, fail-closed). */
  getStats(): { kind: string; count: number }[] {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    return this.adapter.all<{ kind: string; count: number }>(
      `SELECT kind, COUNT(*) as count
       FROM relationships
       WHERE ${scope.clause}
       GROUP BY kind
       ORDER BY count DESC`,
      [...scope.params],
    );
  }

  private prepareStatements(): void {
    const scopeClause = buildCodeScopeFilter(this.projectId, 's').clause;
    this.stmts = {
      insertRelationship: this.adapter.prepare(`
        INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      deleteFileRelationships: this.adapter.prepare(
        'DELETE FROM relationships WHERE file_path = ?'
      ),
      findCallers: this.adapter.prepare(`
        SELECT s.name, s.kind, f.relative_path as file_path, s.start_line as def_line, r.line as call_line,
               s.parent_symbol as parameters, s.visibility as is_async, s.id
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON f.id = s.file_id
        WHERE r.target_symbol = ? AND r.kind = ? AND ${scopeClause}
        ORDER BY f.relative_path, r.line
        LIMIT ?
      `),
      findCallees: this.adapter.prepare(`
        SELECT r.target_symbol as name, r.line as call_line, r.metadata,
               ts.kind, tf.relative_path as file_path, ts.start_line as def_line
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        LEFT JOIN symbols ts ON ts.id = r.target_symbol_id
        LEFT JOIN files tf ON tf.id = ts.file_id
        WHERE r.source_symbol_id = ? AND r.kind = ? AND ${scopeClause}
        ORDER BY r.line
        LIMIT ?
      `),
      resolveTarget: this.adapter.prepare(
        'UPDATE relationships SET target_symbol_id = ? WHERE id = ?'
      ),
      countRelationships: this.adapter.prepare(
        'SELECT COUNT(*) as count FROM relationships'
      ),
    };
  }
}
