/**
 * Query Layer — FTS5 search, symbol lookup, module listing.
 * SA4E-41: every method is tenant-scoped and fail-closed via CodeIntelIsolation.
 * SA4E-53: refactored to use DatabaseAdapter (async) instead of Database.Database directly.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter, type CodeScopeFilter } from './code-intel-isolation.js';

export interface SearchResult {
  name: string;
  kind: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
  docComment: string | null;
  rank: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
  visibility: string | null;
  docComment: string | null;
  parentSymbol: string | null;
}

export interface ModuleInfo {
  name: string;
  rootPath: string;
  language: string | null;
  description: string | null;
  fileCount: number;
  symbolCount: number;
  diStyle: string | null;
  errorHandling: string | null;
  namingConvention: string | null;
  loggingFramework: string | null;
  testingFramework: string | null;
  purpose: string | null;
}

export interface IndexStatus {
  totalFiles: number;
  totalSymbols: number;
  totalModules: number;
  languages: Record<string, number>;
  lastIndexed: string | null;
}

const MODULE_COLUMNS = `name, root_path as rootPath, language, description,
  file_count as fileCount, symbol_count as symbolCount,
  di_style as diStyle, error_handling as errorHandling,
  naming_convention as namingConvention,
  logging_framework as loggingFramework,
  testing_framework as testingFramework, purpose`;

const SYMBOL_COLUMNS = `s.name, s.kind, s.signature, f.relative_path as filePath,
  s.start_line as startLine, s.end_line as endLine,
  s.visibility, s.doc_comment as docComment, s.parent_symbol as parentSymbol`;

export class QueryLayer {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Full-text search across symbols, scoped to one tenant.
   * Dual-dialect: SQLite uses the FTS5 `symbols_fts` virtual table (MATCH + rank);
   * PostgreSQL falls back to an ILIKE search on the `symbols` table because the
   * FTS5 virtual table is SQLite-specific (there is no tsvector column for code symbols).
   */
  async searchCode(projectId: string | undefined, query: string, limit = 20): Promise<SearchResult[]> {
    const scope = buildCodeScopeFilter(projectId, 's');
    if (this.adapter.getEngine() === 'sqlite') {
      return this.searchCodeSqlite(scope, sanitizeFtsQuery(query), limit);
    }
    return this.searchCodePortable(scope, query, limit);
  }

  /** SQLite FTS5 search against the symbols_fts virtual table. */
  private async searchCodeSqlite(
    scope: CodeScopeFilter,
    ftsQuery: string,
    limit: number,
  ): Promise<SearchResult[]> {
    return this.adapter.allAsync<SearchResult>(
      `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
              s.start_line as startLine, s.end_line as endLine,
              s.doc_comment as docComment, rank
       FROM symbols_fts
       JOIN symbols s ON symbols_fts.rowid = s.id
       JOIN files f ON s.file_id = f.id
       WHERE symbols_fts MATCH ? AND ${scope.clause}
       ORDER BY rank LIMIT ?`,
      [ftsQuery, ...scope.params, limit],
    );
  }

  /**
   * Full-text search for PostgreSQL using the `search_tsv` tsvector column
   * (created by the graph migrator). Ranks by ts_rank and falls back to an
   * ILIKE substring search when the query has no usable full-text terms.
   */
  private async searchCodePortable(
    scope: CodeScopeFilter,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const tsTerms = sanitizeLikeQuery(query);
    if (this.adapter.getEngine() === 'postgresql' && tsTerms) {
      const rows = await this.searchCodePostgresFts(scope, tsTerms, limit);
      if (rows.length > 0) return rows;
    }
    return this.searchCodeLike(scope, tsTerms, limit);
  }

  /** PostgreSQL tsvector full-text search ranked by ts_rank. */
  private async searchCodePostgresFts(
    scope: CodeScopeFilter,
    terms: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const tsQuery = terms.split(/\s+/).filter(Boolean).join(' | ');
    return this.adapter.allAsync<SearchResult>(
      `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
              s.start_line as startLine, s.end_line as endLine,
              s.doc_comment as docComment,
              ts_rank(s.search_tsv, to_tsquery('english', ?)) as rank
       FROM symbols s
       JOIN files f ON s.file_id = f.id
       WHERE s.search_tsv @@ to_tsquery('english', ?) AND ${scope.clause}
       ORDER BY rank DESC LIMIT ?`,
      [tsQuery, tsQuery, ...scope.params, limit],
    );
  }

  /**
   * Portable ILIKE substring search — used as the PostgreSQL fallback and for
   * any other non-SQLite engine. Matches name, signature and doc comment.
   */
  private async searchCodeLike(
    scope: CodeScopeFilter,
    terms: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const pattern = `%${terms}%`;
    return this.adapter.allAsync<SearchResult>(
      `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
              s.start_line as startLine, s.end_line as endLine,
              s.doc_comment as docComment, 0 as rank
       FROM symbols s
       JOIN files f ON s.file_id = f.id
       WHERE (s.name ILIKE ? OR s.signature ILIKE ? OR s.doc_comment ILIKE ?)
         AND ${scope.clause}
       ORDER BY s.name LIMIT ?`,
      [pattern, pattern, pattern, ...scope.params, limit],
    );
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
      WHERE s.name LIKE ? AND ${scope.clause}`;
    const params: unknown[] = [`${name}%`, ...scope.params];
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
    return this.adapter.allAsync<ModuleInfo>(
      `SELECT ${MODULE_COLUMNS} FROM modules WHERE ${scope.clause} AND name LIKE ? ORDER BY name`,
      [...[...scope.params], `${name}%`],
    );
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

function sanitizeFtsQuery(query: string): string {
  return query.replace(/[^\w\s*"]/g, ' ').trim() || '*';
}

/**
 * Sanitize a query for use inside a LIKE/ILIKE pattern.
 * Strips FTS operators and escapes LIKE wildcards (% and _) so user input is
 * matched literally rather than as a wildcard pattern.
 */
function sanitizeLikeQuery(query: string): string {
  return query
    .replace(/[*"]/g, ' ')
    .replace(/[%_\\]/g, '\\$&')
    .replace(/\s+/g, ' ')
    .trim();
}
