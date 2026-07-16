/**
 * Query Layer — FTS5 search, symbol lookup, module listing.
 * Provides the data access layer for all MCP tool handlers.
 * SA4E-41: every method is tenant-scoped and fail-closed via CodeIntelIsolation.
 */

import Database from 'better-sqlite3';
import { DatabaseManager } from '../db/database-manager.js';
import { buildCodeScopeFilter } from './code-intel-isolation.js';

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
  private db: Database.Database;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDb();
  }

  /** Full-text search across symbols using FTS5, scoped to one tenant. */
  searchCode(projectId: string | undefined, query: string, limit: number = 20): SearchResult[] {
    const ftsQuery = sanitizeFtsQuery(query);
    const scope = buildCodeScopeFilter(projectId, 's');
    const stmt = this.db.prepare(`
      SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
             s.start_line as startLine, s.end_line as endLine,
             s.doc_comment as docComment, rank
      FROM symbols_fts
      JOIN symbols s ON symbols_fts.rowid = s.id
      JOIN files f ON s.file_id = f.id
      WHERE symbols_fts MATCH ? AND ${scope.clause}
      ORDER BY rank
      LIMIT ?
    `);
    return stmt.all(ftsQuery, ...scope.params, limit) as SearchResult[];
  }

  /** Lookup symbols by exact name or prefix, scoped to one tenant. */
  findSymbols(projectId: string | undefined, name: string, kind?: string, limit: number = 50): SymbolInfo[] {
    const scope = buildCodeScopeFilter(projectId, 's');
    let sql = `SELECT ${SYMBOL_COLUMNS} FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name LIKE ? AND ${scope.clause}`;
    const params: any[] = [`${name}%`, ...scope.params];
    if (kind) { sql += ' AND s.kind = ?'; params.push(kind); }
    sql += ' ORDER BY s.name LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params) as SymbolInfo[];
  }

  /** Get symbols in a specific file, scoped to one tenant. */
  getFileSymbols(projectId: string | undefined, relativePath: string): SymbolInfo[] {
    const scope = buildCodeScopeFilter(projectId, 'f');
    const stmt = this.db.prepare(`
      SELECT ${SYMBOL_COLUMNS} FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE f.relative_path = ? AND ${scope.clause}
      ORDER BY s.start_line
    `);
    return stmt.all(relativePath, ...scope.params) as SymbolInfo[];
  }

  /** List all modules with stats and pattern metadata for one tenant. */
  listModules(projectId: string | undefined): ModuleInfo[] {
    const scope = buildCodeScopeFilter(projectId, 'modules');
    const stmt = this.db.prepare(`SELECT ${MODULE_COLUMNS} FROM modules WHERE ${scope.clause} ORDER BY name`);
    return stmt.all(...scope.params) as ModuleInfo[];
  }

  /** List modules with pattern metadata, optionally filtered by name. */
  listModulesWithPatterns(projectId: string | undefined, name: string | null): ModuleInfo[] {
    if (!name) return this.listModules(projectId);
    const scope = buildCodeScopeFilter(projectId, 'modules');
    const stmt = this.db.prepare(
      `SELECT ${MODULE_COLUMNS} FROM modules WHERE ${scope.clause} AND name LIKE ? ORDER BY name`
    );
    return stmt.all(...scope.params, `${name}%`) as ModuleInfo[];
  }

  /** Get index status and statistics, scoped to one tenant. */
  getIndexStatus(projectId: string | undefined): IndexStatus {
    const f = buildCodeScopeFilter(projectId, 'files');
    const s = buildCodeScopeFilter(projectId, 'symbols');
    const m = buildCodeScopeFilter(projectId, 'modules');
    const files = this.db.prepare(`SELECT COUNT(*) as c FROM files WHERE ${f.clause}`).get(...f.params) as { c: number };
    const symbols = this.db.prepare(`SELECT COUNT(*) as c FROM symbols WHERE ${s.clause}`).get(...s.params) as { c: number };
    const modules = this.db.prepare(`SELECT COUNT(*) as c FROM modules WHERE ${m.clause}`).get(...m.params) as { c: number };
    const lastRow = this.db.prepare(`SELECT MAX(last_indexed) as t FROM files WHERE ${f.clause}`).get(...f.params) as { t: string | null };
    const langRows = this.db.prepare(
      `SELECT language, COUNT(*) as c FROM files WHERE ${f.clause} GROUP BY language`
    ).all(...f.params) as { language: string; c: number }[];

    const languages: Record<string, number> = {};
    for (const row of langRows) languages[row.language] = row.c;

    return {
      totalFiles: files.c,
      totalSymbols: symbols.c,
      totalModules: modules.c,
      languages,
      lastIndexed: lastRow.t,
    };
  }
}

function sanitizeFtsQuery(query: string): string {
  return query.replace(/[^\w\s*"]/g, ' ').trim() || '*';
}
