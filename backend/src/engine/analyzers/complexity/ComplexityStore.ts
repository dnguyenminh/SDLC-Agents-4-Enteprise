/**
 * KSA-161: Complexity Store — CRUD for complexity analysis results.
 * SA4E-53: async API for PostgreSQL compatibility, uses DialectHelper for upserts.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
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
  private dialect: DialectHelper;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 read scope. Undefined => query() is fail-closed.
   *   Write paths (upsert) are keyed by symbol_id and don't require a scope.
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.projectId = projectId;
    // SA4E-53: fire-and-forget async table creation (safe — CREATE IF NOT EXISTS)
    this.ensureTable().catch(() => {});
  }

  /** Store or update complexity result for a symbol. */
  async upsert(result: ComplexityResult): Promise<void> {
    const sql = this.buildUpsertSql();
    await this.adapter.runAsync(sql, [
      result.symbol_id, result.cyclomatic_complexity, result.branches,
      result.loops, result.logical_ops, result.nesting_depth,
      result.early_returns, result.exception_handlers, result.grade,
    ]);
  }

  /** Batch upsert complexity results. */
  async upsertBatch(results: ComplexityResult[]): Promise<void> {
    await this.adapter.transactionAsync(async () => {
      for (const r of results) await this.upsert(r);
    });
  }

  /** Get complexity for a specific symbol. */
  async getBySymbol(symbolId: number): Promise<ComplexityResult | null> {
    const sql = `
      SELECT c.*, s.name as symbol_name, f.relative_path as file_path,
             s.start_line, s.end_line
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE c.symbol_id = ?`;
    const row = await this.adapter.getAsync<ComplexityResult>(sql, [symbolId]);
    return row ?? null;
  }

  /** Query complexity results with filters (tenant-scoped, fail-closed). */
  async query(filters: ComplexityFilters): Promise<ComplexityQueryResult> {
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

    const total = await this.countResults(sql, params);
    sql = this.appendSorting(sql, filters);
    sql += ' LIMIT ?';
    params.push(filters.limit);

    const results = await this.adapter.allAsync<ComplexityResult>(sql, params);
    const gradeDistribution = await this.getGradeDistribution(scope, filters.module);
    const average = await this.getAverage(scope);

    return { results, total, summary: { average, gradeDistribution } };
  }

  /** Delete complexity data for a symbol. */
  async deleteBySymbol(symbolId: number): Promise<void> {
    await this.adapter.runAsync('DELETE FROM complexity WHERE symbol_id = ?', [symbolId]);
  }

  private buildUpsertSql(): string {
    const columns = [
      'symbol_id', 'cyclomatic_complexity', 'branches', 'loops', 'logical_ops',
      'nesting_depth', 'early_returns', 'exception_handlers', 'grade', 'computed_at',
    ];
    const updateCols = columns.filter(c => c !== 'symbol_id');
    return this.adapter.getEngine() === 'sqlite'
      ? `INSERT OR REPLACE INTO complexity (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      : `INSERT INTO complexity (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) ON CONFLICT (symbol_id) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  }

  private async countResults(sql: string, params: unknown[]): Promise<number> {
    const countSql = sql.replace(/SELECT c\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const row = await this.adapter.getAsync<{ total: number }>(countSql, params);
    return row?.total ?? 0;
  }

  private appendSorting(sql: string, filters: ComplexityFilters): string {
    switch (filters.sortBy) {
      case 'name': return sql + ' ORDER BY s.name ASC';
      case 'file': return sql + ' ORDER BY f.relative_path ASC, s.start_line ASC';
      default: return sql + ' ORDER BY c.cyclomatic_complexity DESC';
    }
  }

  private async getGradeDistribution(
    scope: { clause: string; params: readonly unknown[] }, module?: string,
  ): Promise<Record<Grade, number>> {
    const distSql = `
      SELECT c.grade, COUNT(*) as count
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE ${scope.clause} ${module ? 'AND f.module = ?' : ''}
      GROUP BY c.grade`;
    const distParams = module ? [...scope.params, module] : [...scope.params];
    const rows = await this.adapter.allAsync<{ grade: Grade; count: number }>(distSql, distParams);
    const dist: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const row of rows) dist[row.grade] = row.count;
    return dist;
  }

  private async getAverage(scope: { clause: string; params: readonly unknown[] }): Promise<number> {
    const avgSql = `
      SELECT AVG(c.cyclomatic_complexity) as avg
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      WHERE ${scope.clause}`;
    const row = await this.adapter.getAsync<{ avg: number | null }>(avgSql, [...scope.params]);
    return row?.avg ?? 0;
  }

  private async ensureTable(): Promise<void> {
    await this.adapter.runAsync(CREATE_TABLE);
  }
}