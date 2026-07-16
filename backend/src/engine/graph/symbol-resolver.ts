/**
 * KSA-154: Symbol Resolver — resolves symbol names to database records.
 * Supports exact match, qualified names (Class.method), and file:symbol format.
 * SA4E-41: all resolution is tenant-scoped and fail-closed via CodeIntelIsolation.
 */

import Database from 'better-sqlite3';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export interface ResolvedSymbol {
  id: number;
  name: string;
  kind: string;
  filePath: string;
  line: number;
  parentSymbolId: number | null;
}

export class SymbolResolver {
  private db: Database.Database;
  private scopeParams: readonly unknown[];
  private stmts: {
    exactMatch: Database.Statement;
    qualifiedMatch: Database.Statement;
    fileMatch: Database.Statement;
    fuzzyMatch: Database.Statement;
  };

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(db: Database.Database, projectId?: string) {
    this.db = db;
    const scope = buildCodeScopeFilter(projectId, 's');
    this.scopeParams = scope.params;
    this.stmts = {
      exactMatch: db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ? AND ${scope.clause}
        ORDER BY s.start_line ASC
      `),
      qualifiedMatch: db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        JOIN symbols p ON p.id = s.parent_symbol_id
        WHERE s.name = ? AND p.name = ? AND ${scope.clause}
      `),
      fileMatch: db.prepare(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ? AND f.relative_path LIKE ? AND ${scope.clause}
      `),
      fuzzyMatch: db.prepare(`
        SELECT DISTINCT s.name
        FROM symbols s
        WHERE s.name LIKE ? AND ${scope.clause}
        LIMIT ?
      `),
    };
  }

  /** Resolve a symbol name to one or more database records. */
  resolve(input: string): ResolvedSymbol[] {
    // Strategy 1: Exact match
    let results = this.stmts.exactMatch.all(input, ...this.scopeParams) as ResolvedSymbol[];
    if (results.length > 0) return results;

    // Strategy 2: Qualified name (Class.method)
    if (input.includes('.')) {
      const dotIndex = input.lastIndexOf('.');
      const parent = input.substring(0, dotIndex);
      const method = input.substring(dotIndex + 1);
      results = this.stmts.qualifiedMatch.all(method, parent, ...this.scopeParams) as ResolvedSymbol[];
      if (results.length > 0) return results;
    }

    // Strategy 3: file:symbol format
    if (input.includes(':')) {
      const colonIndex = input.lastIndexOf(':');
      const file = input.substring(0, colonIndex);
      const name = input.substring(colonIndex + 1);
      results = this.stmts.fileMatch.all(name, `%${file}%`, ...this.scopeParams) as ResolvedSymbol[];
      if (results.length > 0) return results;
    }

    return [];
  }

  /** Suggest similar symbol names for "did you mean?" responses. */
  suggest(input: string, limit: number = 5): string[] {
    const rows = this.stmts.fuzzyMatch.all(`%${input}%`, ...this.scopeParams, limit) as { name: string }[];
    return rows.map(r => r.name);
  }
}
