/**
 * Query Layer — FTS5 search, symbol lookup, module listing.
 * SA4E-41: every method is tenant-scoped and fail-closed via CodeIntelIsolation.
 * SA4E-53: refactored to use DatabaseAdapter (async) instead of Database.Database directly.
 * Facade (BR-18): types/sanitizers in query-utils.ts, search backends in query-search.ts.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter } from './code-intel-isolation.js';
import type {
  SearchResult, SymbolInfo, ModuleInfo, IndexStatus, LocateRow,
} from './query-utils.js';
import { MODULE_COLUMNS, SYMBOL_COLUMNS, sanitizeLikeQuery } from './query-utils.js';
import { searchCode } from './query-search.js';

export type {
  SearchResult, SymbolInfo, ModuleInfo, IndexStatus, LocateRow,
};

export class QueryLayer {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Full-text search across symbols, scoped to one tenant.
   * Dual-dialect: SQLite uses the FTS5 `symbols_fts` virtual table (MATCH + rank);
   * PostgreSQL falls back to an ILIKE search on the `symbols` table because the
   * FTS5 virtual table is SQLite-specific (there is no tsvector column for code symbols).
   */
  async searchCode(projectId: string | undefined, query: string, limit = 20): Promise<SearchResult[]> {
    return searchCode(this.adapter, projectId, query, limit);
  }

  /** Lookup symbols by exact name or prefix, scoped to one tenant. */
  async findSymbols(
    projectId: string | undefined,
    name: string,
    kind?: string,
    limit = 50,
  ): Promise<SymbolInfo[]> {
    const scope = buildCodeScopeFilter(projectId, 's');
    let sql = `SELECT ${SYMBOL_COLUMNS} FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name LIKE ? ESCAPE '\\' AND ${scope.clause}`;
    // SEC-360-05: escape LIKE wildcards so user input is matched literally.
    const params: unknown[] = [`${sanitizeLikeQuery(name)}%`, ...scope.params];
    if (kind) { sql += ' AND s.kind = ?'; params.push(kind); }
    sql += ' ORDER BY s.name LIMIT ?';
    params.push(limit);
    return this.adapter.allAsync<SymbolInfo>(sql, params);
  }

  /** Get symbols in a specific file, scoped to one tenant. */
  async getFileSymbols(projectId: string | undefined, relativePath: string): Promise<SymbolInfo[]> {
    const scope = buildCodeScopeFilter(projectId, 'f');
    return this.adapter.allAsync<SymbolInfo>(
      `SELECT ${SYMBOL_COLUMNS} FROM symbols s
       JOIN files f ON s.file_id = f.id
       WHERE f.relative_path = ? AND ${scope.clause}
       ORDER BY s.start_line`,
      [relativePath, ...scope.params],
    );
  }

  /** List all modules with stats and pattern metadata for one tenant. */
  async listModules(projectId: string | undefined): Promise<ModuleInfo[]> {
    const scope = buildCodeScopeFilter(projectId, 'modules');
    return this.adapter.allAsync<ModuleInfo>(
      `SELECT ${MODULE_COLUMNS} FROM modules WHERE ${scope.clause} ORDER BY name`,
      [...scope.params],
    );
  }

  /** List modules with pattern metadata, optionally filtered by name. */
  async listModulesWithPatterns(
    projectId: string | undefined,
    name: string | null,
  ): Promise<ModuleInfo[]> {
    if (!name) return this.listModules(projectId);
    const scope = buildCodeScopeFilter(projectId, 'modules');
    // SEC-360-05: escape LIKE wildcards (same treatment as findSymbols).
    return this.adapter.allAsync<ModuleInfo>(
      `SELECT ${MODULE_COLUMNS} FROM modules WHERE ${scope.clause} AND name LIKE ? ESCAPE '\\' ORDER BY name`,
      [...[...scope.params], `${sanitizeLikeQuery(name)}%`],
    );
  }

  /**
   * SA4E-360 (C-360-R2 / TDD §4.2) — exact symbol locate for read_method.
   * Equality-based (no LIKE wildcard vector) with enclosing-type scoping:
   * `parent_symbol` match when populated (tree-sitter path) plus a
   * same-file-membership fallback (class row shares file_id) so regex-indexed
   * corpora with null parent_symbol still resolve. Returns endLine + the
   * file's line_count so callers bounds-check BEFORE reading (EF-4).
   */
  async locateSymbol(
    projectId: string | undefined,
    cls: string,
    method: string,
    limit = 25,
  ): Promise<LocateRow[]> {
    const scope = buildCodeScopeFilter(projectId, 's');
    // Subquery references the UNALIASED symbols table — the scope alias must
    // be the table name itself (the outer query is aliased 's').
    const subScope = buildCodeScopeFilter(projectId, 'symbols');
    const bounded = Math.min(Math.max(1, Math.floor(limit)), 100);
    const sql = `SELECT s.name, s.kind, s.signature,
      f.relative_path AS filePath,
      s.start_line AS startLine, s.end_line AS endLine,
      f.line_count AS lineCount, s.parent_symbol AS parentSymbol
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name = ?
        AND s.kind IN ('method','function')
        AND ${scope.clause}
        AND ( s.parent_symbol = ?
           OR s.file_id IN (SELECT id FROM symbols
                            WHERE name = ?
                              AND kind IN ('class','interface','struct','trait')
                              AND ${subScope.clause}) )
      ORDER BY f.relative_path, s.start_line
      LIMIT ?`;
    return this.adapter.allAsync<LocateRow>(sql, [
      method, ...scope.params, cls, cls, ...subScope.params, bounded,
    ]);
  }

  /**
   * AF-4 enrichment (one call): top N distinct indexed method names of a
   * matched class — served alongside an empty locate result.
   */
  async listClassMethods(
    projectId: string | undefined,
    cls: string,
    limit = 10,
  ): Promise<string[]> {
    const scope = buildCodeScopeFilter(projectId, 's');
    // Same unaliased-table scope as locateSymbol (§4.2).
    const subScope = buildCodeScopeFilter(projectId, 'symbols');
    const bounded = Math.min(Math.max(1, Math.floor(limit)), 50);
    const sql = `SELECT DISTINCT s.name
      FROM symbols s
      WHERE s.kind IN ('method','function')
        AND ${scope.clause}
        AND ( s.parent_symbol = ?
           OR s.file_id IN (SELECT id FROM symbols
                            WHERE name = ?
                              AND kind IN ('class','interface','struct','trait')
                              AND ${subScope.clause}) )
      ORDER BY s.name
      LIMIT ?`;
    const rows = await this.adapter.allAsync<{ name: string }>(sql, [
      // F-3 (SA4E-360): placeholder order is [s.project_id, parent_symbol,
      // subquery-name, symbols.project_id, LIMIT] — scope params FIRST, then
      // both cls bindings. Binding cls before scope.params misaligned
      // s.project_id → AF-4 enrichment silently empty when projectId defined.
      ...scope.params, cls, cls, ...subScope.params, bounded,
    ]);
    return rows.map((r) => r.name);
  }

  /** Get index status and statistics, scoped to one tenant. */
  async getIndexStatus(projectId: string | undefined): Promise<IndexStatus> {
    const f = buildCodeScopeFilter(projectId, 'files');
    const s = buildCodeScopeFilter(projectId, 'symbols');
    const m = buildCodeScopeFilter(projectId, 'modules');

    const [filesRow, symbolsRow, modulesRow, lastRow, langRows] = await Promise.all([
      this.adapter.getAsync<{ c: number }>(`SELECT COUNT(*) as c FROM files WHERE ${f.clause}`, [...f.params]),
      this.adapter.getAsync<{ c: number }>(`SELECT COUNT(*) as c FROM symbols WHERE ${s.clause}`, [...s.params]),
      this.adapter.getAsync<{ c: number }>(`SELECT COUNT(*) as c FROM modules WHERE ${m.clause}`, [...m.params]),
      this.adapter.getAsync<{ t: string | null }>(`SELECT MAX(last_indexed) as t FROM files WHERE ${f.clause}`, [...f.params]),
      this.adapter.allAsync<{ language: string; c: number }>(
        `SELECT language, COUNT(*) as c FROM files WHERE ${f.clause} GROUP BY language`, [...f.params],
      ),
    ]);

    const languages: Record<string, number> = {};
    for (const row of langRows) languages[row.language] = row.c;

    return {
      totalFiles: filesRow?.c ?? 0,
      totalSymbols: symbolsRow?.c ?? 0,
      totalModules: modulesRow?.c ?? 0,
      languages,
      lastIndexed: lastRow?.t ?? null,
    };
  }
}
