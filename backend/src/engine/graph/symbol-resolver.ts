/**
 * KSA-154: Symbol Resolver — resolves symbol names to database records.
 * Supports exact match, qualified names (Class.method), and file:symbol format.
 * SA4E-41: all resolution is tenant-scoped and fail-closed via CodeIntelIsolation.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 * SA4E-53: Async API — no PreparedStatements, uses allAsync() for PostgreSQL compat.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
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
  private adapter: DatabaseAdapter;
  private scopeClause: string;
  private scopeParams: readonly unknown[];

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined => fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    const scope = buildCodeScopeFilter(projectId, 's');
    this.scopeClause = scope.clause;
    this.scopeParams = scope.params;
  }

  /** Resolve a symbol name to one or more database records. */
  async resolve(input: string): Promise<ResolvedSymbol[]> {
    // Strategy 1: Exact match
    let results = await this.adapter.allAsync<ResolvedSymbol>(`
      SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name = ? AND ${this.scopeClause}
      ORDER BY s.start_line ASC
    `, [input, ...this.scopeParams]);
    if (results.length > 0) return results;

    // Strategy 2: Qualified name (Class.method)
    if (input.includes('.')) {
      const dotIndex = input.lastIndexOf('.');
      const parent = input.substring(0, dotIndex);
      const method = input.substring(dotIndex + 1);
      results = await this.adapter.allAsync<ResolvedSymbol>(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        JOIN symbols p ON p.id = s.parent_symbol_id
        WHERE s.name = ? AND p.name = ? AND ${this.scopeClause}
      `, [method, parent, ...this.scopeParams]);
      if (results.length > 0) return results;
    }

    // Strategy 3: file:symbol format
    if (input.includes(':')) {
      const colonIndex = input.lastIndexOf(':');
      const file = input.substring(0, colonIndex);
      const name = input.substring(colonIndex + 1);
      results = await this.adapter.allAsync<ResolvedSymbol>(`
        SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as line, s.parent_symbol_id as parentSymbolId
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ? AND f.relative_path LIKE ? AND ${this.scopeClause}
      `, [name, `%${file}%`, ...this.scopeParams]);
      if (results.length > 0) return results;
    }

    return [];
  }

  /** Suggest similar symbol names for "did you mean?" responses. */
  async suggest(input: string, limit: number = 5): Promise<string[]> {
    const rows = await this.adapter.allAsync<{ name: string }>(`
      SELECT DISTINCT s.name
      FROM symbols s
      WHERE s.name LIKE ? AND ${this.scopeClause}
      LIMIT ?
    `, [`%${input}%`, ...this.scopeParams, limit]);
    return rows.map(r => r.name);
  }
}
