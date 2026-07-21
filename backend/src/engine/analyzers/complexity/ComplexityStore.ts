/**
 * KSA-161: SQLite CRUD for complexity results.
 */

import type { DatabaseAdapter, PreparedStatement } from '../../../database/adapters/DatabaseAdapter.js';
import type { ComplexityResult, ComplexityFilters, ComplexityQueryResult, Grade } from './types.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS complexity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL,
  cyclomatic_complexity INTEGER NOT NULL DEFAULT 1,
  branches INTEGER NOT NULL DEFAULT 0,
  loops INTEGER NOT NULL DEFAULT 0,
  logical_ops INTEGER NOT NULL DEFAULT 0,
  nesting_depth INTEGER NOT NULL DEFAULT 0,
  early_returns INTEGER NOT NULL DEFAULT 0,
  exception_handlers INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'A',
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
  UNIQUE(symbol_id)
);
CREATE INDEX IF NOT EXISTS idx_complexity_grade ON complexity(grade);
CREATE INDEX IF NOT EXISTS idx_complexity_cc ON complexity(cyclomatic_complexity DESC);
CREATE INDEX IF NOT EXISTS idx_complexity_symbol ON complexity(symbol_id);
`;

export class ComplexityStore {
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;
  private stmts!: {
    upsert: PreparedStatement;
    getBySymbol: PreparedStatement;
    deleteBySymbol: PreparedStatement;
  };

  /**
   * @param projectId  SA4E-41 read scope. Undefined ⇒ query() is fail-closed.
   *   Write paths (upsert) are keyed by symbol_id and don't require a scope.
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.ensureTable();
    this.prepareStatements();
  }

  /** Store or update complexity result for a symbol. */
  upsert(result: ComplexityResult): void {
    this.stmts.upsert.run(
      result.symbol_id,
      result.cyclomatic_complexity,
      result.branches,
      result.loops,
      result.logical_ops,
      result.nesting_depth,
      result.early_returns,
      result.exception_handlers,
      result.grade
    );
  }

  /** Batch upsert complexity results. */
  upsertBatch(results: ComplexityResult[]): void {
    this.adapter.transaction(() => { for (const r of results) this.upsert(r); });
  }

  /** Get complexity for a specific symbol. */
  getBySymbol(symbolId: number): ComplexityResult | null {
    return (this.stmts.getBySymbol.get(symbolId) as ComplexityResult) ?? null;
  }

  /** Query complexity results with filters (tenant-scoped, fail-closed). */
  query(filters: ComplexityFilters): ComplexityQueryResult {
    // complexity has no project_id column — scope via the joined symbols table.
    const scope = buildCodeScopeFilter(this.projectId, 's');
    let sql = `
      SELECT c.*, s.name as symbol_name, f.relative_path as file_path,
             s.start_line, s.end_line
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];

    if (filters.filePath) {
      sql += ' AND f.relative_path LIKE ?';
      params.push(`%${filters.filePath}%`);
    }
    if (filters.symbolName) {
      sql += ' AND s.name LIKE ?';
      params.push(`%${filters.symbolName}%`);
    }
    if (filters.minComplexity !== undefined) {
      sql += ' AND c.cyclomatic_complexity >= ?';
      params.push(filters.minComplexity);
    }
    if (filters.gradeFilter && filters.gradeFilter.length > 0) {
      const placeholders = filters.gradeFilter.map(() => '?').join(',');
      sql += ` AND c.grade IN (${placeholders})`;
      params.push(...filters.gradeFilter);
    }
    if (filters.module) {
      sql += ' AND f.module = ?';
      params.push(filters.module);
    }

    // Count total before limit
    const countSql = sql.replace(/SELECT c\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const totalRow = this.adapter.prepare(countSql).get(...params) as { total: number } | undefined;
    const total = totalRow?.total ?? 0;

    // Sort and limit
    switch (filters.sortBy) {
      case 'name': sql += ' ORDER BY s.name ASC'; break;
      case 'file': sql += ' ORDER BY f.relative_path ASC, s.start_line ASC'; break;
      default: sql += ' ORDER BY c.cyclomatic_complexity DESC'; break;
    }
    sql += ' LIMIT ?';
    params.push(filters.limit);

    const results = this.adapter.prepare(sql).all(...params) as ComplexityResult[];

    // Grade distribution (tenant-scoped)
    const distSql = `
      SELECT c.grade, COUNT(*) as count
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE ${scope.clause} ${filters.module ? 'AND f.module = ?' : ''}
      GROUP BY c.grade
    `;
    const distParams = filters.module ? [...scope.params, filters.module] : [...scope.params];
    const distRows = this.adapter.prepare(distSql).all(...distParams) as { grade: Grade; count: number }[];
    const gradeDistribution: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const row of distRows) gradeDistribution[row.grade] = row.count;

    // Average (tenant-scoped via joined symbols)
    const avgSql = `
      SELECT AVG(c.cyclomatic_complexity) as avg
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      WHERE ${scope.clause}
    `;
    const avgRow = this.adapter.prepare(avgSql).get(...scope.params) as { avg: number | null };

    return {
      results,
      total,
      summary: {
        average: avgRow?.avg ?? 0,
        gradeDistribution,
      },
    };
  }

  /** Delete complexity data for a symbol. */
  deleteBySymbol(symbolId: number): void {
    this.stmts.deleteBySymbol.run(symbolId);
  }

  private ensureTable(): void {
    this.adapter.exec(CREATE_TABLE);
  }

  private prepareStatements(): void {
    this.stmts = {
      upsert: this.adapter.prepare(`
        INSERT OR REPLACE INTO complexity
          (symbol_id, cyclomatic_complexity, branches, loops, logical_ops,
           nesting_depth, early_returns, exception_handlers, grade, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `),
      getBySymbol: this.adapter.prepare(`
        SELECT c.*, s.name as symbol_name, f.relative_path as file_path,
               s.start_line, s.end_line
        FROM complexity c
        JOIN symbols s ON s.id = c.symbol_id
        JOIN files f ON f.id = s.file_id
        WHERE c.symbol_id = ?
      `),
      deleteBySymbol: this.adapter.prepare('DELETE FROM complexity WHERE symbol_id = ?'),
    };
  }
}
