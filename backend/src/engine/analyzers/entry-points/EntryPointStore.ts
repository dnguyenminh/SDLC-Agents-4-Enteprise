/**
 * KSA-162: Entry Point Store — SQLite CRUD for detected entry points.
 */

import type { DatabaseAdapter, PreparedStatement } from '../../../database/adapters/DatabaseAdapter.js';
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
  private projectId: string | undefined;
  private stmts!: {
    upsert: PreparedStatement;
    deleteBySymbol: PreparedStatement;
  };

  /**
   * @param projectId  SA4E-41 read scope. Undefined ⇒ query() is fail-closed.
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.ensureTable();
    this.prepareStatements();
  }

  /** Store or update an entry point. */
  upsert(ep: EntryPoint): void {
    this.stmts.upsert.run(
      ep.symbol_id,
      ep.entry_type,
      ep.framework,
      ep.http_method,
      ep.route_path,
      ep.full_route,
      JSON.stringify(ep.middleware),
      ep.has_auth ? 1 : 0,
      ep.controller,
      ep.event_name,
      ep.confidence
    );
  }

  /** Batch upsert entry points. */
  upsertBatch(entries: EntryPoint[]): void {
    this.adapter.transaction(() => { for (const ep of entries) this.upsert(ep); });
  }

  /** Query entry points with filters. */
  query(filters: EntryPointFilters): EntryPointQueryResult {
    // entry_points has no project_id column — scope via the joined symbols table.
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

    // Count
    const countSql = sql.replace(/SELECT ep\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const totalRow = this.adapter.prepare(countSql).get(...params) as { total: number } | undefined;
    const total = totalRow?.total ?? 0;

    sql += ' ORDER BY ep.entry_type, ep.full_route LIMIT ?';
    params.push(filters.limit);

    const rows = this.adapter.prepare(sql).all(...params) as Array<EntryPoint & { middleware: string }>;
    const results = rows.map(r => ({
      ...r,
      middleware: r.middleware ? JSON.parse(r.middleware as string) : [],
      has_auth: Boolean(r.has_auth),
    }));

    // Summary (tenant-scoped via joined symbols)
    const scoped = (col: string, extra = '') => `
      SELECT ep.${col}, COUNT(*) as count
      FROM entry_points ep JOIN symbols s ON s.id = ep.symbol_id
      WHERE ${scope.clause} ${extra} GROUP BY ep.${col}`;
    const typeRows = this.adapter.prepare(scoped('entry_type')).all(...scope.params) as Array<{ entry_type: string; count: number }>;
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.entry_type] = r.count;

    const fwRows = this.adapter.prepare(scoped('framework', 'AND ep.framework IS NOT NULL')).all(...scope.params) as Array<{ framework: string; count: number }>;
    const byFramework: Record<string, number> = {};
    for (const r of fwRows) byFramework[r.framework] = r.count;

    const authRows = this.adapter.prepare(scoped('has_auth')).all(...scope.params) as Array<{ has_auth: number; count: number }>;
    const authCoverage = { withAuth: 0, withoutAuth: 0 };
    for (const r of authRows) {
      if (r.has_auth) authCoverage.withAuth = r.count;
      else authCoverage.withoutAuth = r.count;
    }

    return { results, total, summary: { byType, byFramework, authCoverage } };
  }

  /** Delete entry point for a symbol. */
  deleteBySymbol(symbolId: number): void {
    this.stmts.deleteBySymbol.run(symbolId);
  }

  private ensureTable(): void {
    this.adapter.exec(CREATE_TABLE);
  }

  private prepareStatements(): void {
    this.stmts = {
      upsert: this.adapter.prepare(`
        INSERT OR REPLACE INTO entry_points
          (symbol_id, entry_type, framework, http_method, route_path, full_route,
           middleware, has_auth, controller, event_name, confidence, detected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `),
      deleteBySymbol: this.adapter.prepare('DELETE FROM entry_points WHERE symbol_id = ?'),
    };
  }
}
