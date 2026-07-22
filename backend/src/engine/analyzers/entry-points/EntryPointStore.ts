/**
 * KSA-162: Entry Point Store — CRUD for detected entry points.
 * SA4E-53: async API for PostgreSQL compatibility, uses DialectHelper for upserts.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { EntryPoint, EntryPointFilters, EntryPointQueryResult } from './types.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS entry_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  framework TEXT,
  http_method TEXT,
  route_path TEXT,
  full_route TEXT,
  middleware TEXT,
  has_auth INTEGER DEFAULT 0,
  controller TEXT,
  event_name TEXT,
  confidence TEXT DEFAULT 'High',
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ep_type ON entry_points(entry_type);
CREATE INDEX IF NOT EXISTS idx_ep_framework ON entry_points(framework);
CREATE INDEX IF NOT EXISTS idx_ep_route ON entry_points(route_path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ep_symbol ON entry_points(symbol_id);
`;

export class EntryPointStore {
  private adapter: DatabaseAdapter;
  private dialect: DialectHelper;
  private projectId: string | undefined;
  private tableReady: Promise<void>;

  /**
   * @param projectId  SA4E-41 read scope. Undefined => query() is fail-closed.
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.projectId = projectId;
    // SA4E-53: async table creation — fire-and-forget in constructor, awaited before first use
    this.tableReady = this.ensureTable();
  }

  /** Store or update an entry point. */
  async upsert(ep: EntryPoint): Promise<void> {
    await this.tableReady;
    const sql = this.buildUpsertSql();
    await this.adapter.runAsync(sql, [
      ep.symbol_id, ep.entry_type, ep.framework, ep.http_method,
      ep.route_path, ep.full_route, JSON.stringify(ep.middleware),
      ep.has_auth ? 1 : 0, ep.controller, ep.event_name, ep.confidence,
    ]);
  }

  /** Batch upsert entry points. */
  async upsertBatch(entries: EntryPoint[]): Promise<void> {
    await this.adapter.transactionAsync(async () => {
      for (const ep of entries) await this.upsert(ep);
    });
  }

  /** Query entry points with filters. */
  async query(filters: EntryPointFilters): Promise<EntryPointQueryResult> {
    await this.tableReady;
    const scope = buildCodeScopeFilter(this.projectId, 's');
    let sql = `
      SELECT ep.*, s.name as symbol_name, f.relative_path as file_path, s.start_line
      FROM entry_points ep
      JOIN symbols s ON s.id = ep.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];

    if (filters.entryType) {
      sql += ' AND ep.entry_type = ?';
      params.push(filters.entryType);
    }
    if (filters.framework) {
      sql += ' AND ep.framework = ?';
      params.push(filters.framework);
    }
    if (filters.httpMethod) {
      sql += ' AND ep.http_method = ?';
      params.push(filters.httpMethod.toUpperCase());
    }
    if (filters.routePattern) {
      sql += ' AND ep.full_route LIKE ?';
      params.push(`%${filters.routePattern}%`);
    }
    if (filters.hasAuth !== undefined) {
      sql += ' AND ep.has_auth = ?';
      params.push(filters.hasAuth ? 1 : 0);
    }
    if (filters.filePath) {
      sql += ' AND f.relative_path LIKE ?';
      params.push(`%${filters.filePath}%`);
    }

    const total = await this.countResults(sql, params);
    sql += ' ORDER BY ep.entry_type, ep.full_route LIMIT ?';
    params.push(filters.limit);

    const rows = await this.adapter.allAsync<EntryPoint & { middleware: string }>(sql, params);
    const results = rows.map(r => ({
      ...r,
      middleware: r.middleware ? JSON.parse(r.middleware as string) : [],
      has_auth: Boolean(r.has_auth),
    }));

    const summary = await this.buildSummary(scope);
    return { results, total, summary };
  }

  /** Delete entry point for a symbol. */
  async deleteBySymbol(symbolId: number): Promise<void> {
    await this.adapter.runAsync('DELETE FROM entry_points WHERE symbol_id = ?', [symbolId]);
  }

  private buildUpsertSql(): string {
    const columns = [
      'symbol_id', 'entry_type', 'framework', 'http_method', 'route_path',
      'full_route', 'middleware', 'has_auth', 'controller', 'event_name',
      'confidence', 'detected_at',
    ];
    const updateCols = columns.filter(c => c !== 'symbol_id');
    return this.adapter.getEngine() === 'sqlite'
      ? `INSERT OR REPLACE INTO entry_points (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      : `INSERT INTO entry_points (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) ON CONFLICT (symbol_id) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
  }

  private async countResults(sql: string, params: unknown[]): Promise<number> {
    const countSql = sql.replace(/SELECT ep\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const row = await this.adapter.getAsync<{ total: number }>(countSql, params);
    return row?.total ?? 0;
  }

  private async buildSummary(scope: { clause: string; params: readonly unknown[] }) {
    const scoped = (col: string, extra = '') => `
      SELECT ep.${col}, COUNT(*) as count
      FROM entry_points ep JOIN symbols s ON s.id = ep.symbol_id
      WHERE ${scope.clause} ${extra} GROUP BY ep.${col}`;

    const typeRows = await this.adapter.allAsync<{ entry_type: string; count: number }>(
      scoped('entry_type'), [...scope.params]);
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.entry_type] = r.count;

    const fwRows = await this.adapter.allAsync<{ framework: string; count: number }>(
      scoped('framework', 'AND ep.framework IS NOT NULL'), [...scope.params]);
    const byFramework: Record<string, number> = {};
    for (const r of fwRows) byFramework[r.framework] = r.count;

    const authRows = await this.adapter.allAsync<{ has_auth: number; count: number }>(
      scoped('has_auth'), [...scope.params]);
    const authCoverage = { withAuth: 0, withoutAuth: 0 };
    for (const r of authRows) {
      if (r.has_auth) authCoverage.withAuth = r.count;
      else authCoverage.withoutAuth = r.count;
    }

    return { byType, byFramework, authCoverage };
  }

  private async ensureTable(): Promise<void> {
    await this.adapter.execAsync(CREATE_TABLE);
  }
}