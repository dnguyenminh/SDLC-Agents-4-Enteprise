/**
 * KSA-153: Graph Repository — CRUD operations for the code relationship graph.
 * Provides prepared-statement-based access to the relationships table.
 */

import Database from 'better-sqlite3';

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
  private db: Database.Database;
  private stmts!: {
    insertRelationship: Database.Statement;
    deleteFileRelationships: Database.Statement;
    findCallers: Database.Statement;
    findCallees: Database.Statement;
    resolveTarget: Database.Statement;
    countRelationships: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  /** Insert a batch of relationships within a transaction. */
  insertRelationships(relationships: RelationshipInput[]): void {
    const transaction = this.db.transaction((rels: RelationshipInput[]) => {
      for (const rel of rels) {
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
    transaction(relationships);
  }

  /** Delete all relationships originating from a file (optionally tenant-scoped). */
  deleteFileRelationships(filePath: string, projectId?: string): void {
    if (projectId) {
      this.db.prepare('DELETE FROM relationships WHERE file_path = ? AND project_id = ?').run(filePath, projectId);
      return;
    }
    this.stmts.deleteFileRelationships.run(filePath);
  }

  /** Find direct callers of a symbol by name. */
  findCallers(symbolName: string, kind: string = 'calls', limit: number = 20): CallerResult[] {
    return this.stmts.findCallers.all(symbolName, kind, limit) as CallerResult[];
  }

  /** Find direct callees of a symbol by ID. */
  findCallees(symbolId: number, kind: string = 'calls', limit: number = 20): CalleeResult[] {
    return this.stmts.findCallees.all(symbolId, kind, limit) as CalleeResult[];
  }

  /** Resolve target_symbol_id for unresolved relationships (batch), tenant-scoped. */
  resolveTargets(batchSize: number = 1000, projectId?: string): number {
    const unresolved = (projectId
      ? this.db.prepare('SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL AND r.project_id = ? LIMIT ?').all(projectId, batchSize)
      : this.db.prepare('SELECT r.id, r.target_symbol FROM relationships r WHERE r.target_symbol_id IS NULL LIMIT ?').all(batchSize)
    ) as { id: number; target_symbol: string }[];

    let resolved = 0;
    // Resolve targets only within the same tenant to avoid cross-project matches.
    const findTarget = projectId
      ? this.db.prepare('SELECT id FROM symbols WHERE name = ? AND project_id = ? LIMIT 1')
      : this.db.prepare('SELECT id FROM symbols WHERE name = ? LIMIT 1');

    const transaction = this.db.transaction(() => {
      for (const row of unresolved) {
        const target = (projectId ? findTarget.get(row.target_symbol, projectId) : findTarget.get(row.target_symbol)) as { id: number } | undefined;
        if (target) {
          this.stmts.resolveTarget.run(target.id, row.id);
          resolved++;
        }
      }
    });
    transaction();

    return resolved;
  }

  /** Get total relationship count. */
  getRelationshipCount(): number {
    const row = this.stmts.countRelationships.get() as { count: number };
    return row.count;
  }

  /** Get relationship statistics by kind. */
  getStats(): { kind: string; count: number }[] {
    return this.db.prepare(`
      SELECT kind, COUNT(*) as count
      FROM relationships
      GROUP BY kind
      ORDER BY count DESC
    `).all() as { kind: string; count: number }[];
  }

  private prepareStatements(): void {
    this.stmts = {
      insertRelationship: this.db.prepare(`
        INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      deleteFileRelationships: this.db.prepare(
        'DELETE FROM relationships WHERE file_path = ?'
      ),
      findCallers: this.db.prepare(`
        SELECT s.name, s.kind, f.relative_path as file_path, s.start_line as def_line, r.line as call_line,
               s.parent_symbol as parameters, s.visibility as is_async, s.id
        FROM relationships r
        JOIN symbols s ON s.id = r.source_symbol_id
        JOIN files f ON f.id = s.file_id
        WHERE r.target_symbol = ? AND r.kind = ?
        ORDER BY f.relative_path, r.line
        LIMIT ?
      `),
      findCallees: this.db.prepare(`
        SELECT r.target_symbol as name, r.line as call_line, r.metadata,
               ts.kind, tf.relative_path as file_path, ts.start_line as def_line
        FROM relationships r
        LEFT JOIN symbols ts ON ts.id = r.target_symbol_id
        LEFT JOIN files tf ON tf.id = ts.file_id
        WHERE r.source_symbol_id = ? AND r.kind = ?
        ORDER BY r.line
        LIMIT ?
      `),
      resolveTarget: this.db.prepare(
        'UPDATE relationships SET target_symbol_id = ? WHERE id = ?'
      ),
      countRelationships: this.db.prepare(
        'SELECT COUNT(*) as count FROM relationships'
      ),
    };
  }
}
