/**
 * KSA-163: Graph Loader — Loads subgraphs from the relationships table.
 * SA4E-41: all loads are tenant-scoped and fail-closed via CodeIntelIsolation.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { AdjacencyList } from '../types.js';
import { buildCodeScopeFilter } from '../../../query/code-intel-isolation.js';

export interface SymbolInfo {
  id: number;
  name: string;
  kind: string;
  filePath: string;
}

export class GraphLoader {
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined => fail-closed (empty graph).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
  }

  /** Load the import/dependency graph as adjacency list. */
  loadDependencyGraph(module?: string): AdjacencyList {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    let sql = `
      SELECT source_symbol_id, target_symbol_id
      FROM relationships
      WHERE kind = 'imports'
        AND target_symbol_id IS NOT NULL
        AND file_path NOT LIKE '%node_modules%'
        AND file_path NOT LIKE '%vendor%'
        AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];
    if (module) { sql += ` AND file_path LIKE ?`; params.push(`%${module}%`); }
    return this.buildForwardGraph(sql, params);
  }

  /** Load the call graph as adjacency list (caller -> callee). */
  loadCallGraph(module?: string): AdjacencyList {
    const { sql, params } = this.callGraphQuery(module);
    return this.buildForwardGraph(sql, params);
  }

  /** Load reverse call graph (callee -> callers). */
  loadReverseCallGraph(module?: string): AdjacencyList {
    const { sql, params } = this.callGraphQuery(module);
    const rows = this.adapter.all<{ source_symbol_id: number; target_symbol_id: number }>(sql, params);
    const graph: AdjacencyList = new Map();
    for (const row of rows) {
      if (!graph.has(row.target_symbol_id)) graph.set(row.target_symbol_id, []);
      graph.get(row.target_symbol_id)!.push(row.source_symbol_id);
      if (!graph.has(row.source_symbol_id)) graph.set(row.source_symbol_id, []);
    }
    return graph;
  }

  private callGraphQuery(module?: string): { sql: string; params: unknown[] } {
    const scope = buildCodeScopeFilter(this.projectId, 'relationships');
    let sql = `
      SELECT source_symbol_id, target_symbol_id
      FROM relationships
      WHERE kind = 'calls' AND target_symbol_id IS NOT NULL AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];
    if (module) { sql += ` AND file_path LIKE ?`; params.push(`%${module}%`); }
    return { sql, params };
  }

  private buildForwardGraph(sql: string, params: unknown[]): AdjacencyList {
    const rows = this.adapter.all<{ source_symbol_id: number; target_symbol_id: number }>(sql, params);
    const graph: AdjacencyList = new Map();
    for (const row of rows) {
      if (!graph.has(row.source_symbol_id)) graph.set(row.source_symbol_id, []);
      graph.get(row.source_symbol_id)!.push(row.target_symbol_id);
      if (!graph.has(row.target_symbol_id)) graph.set(row.target_symbol_id, []);
    }
    return graph;
  }

  /** Get symbol info by ID (tenant-scoped). */
  getSymbolInfo(symbolId: number): SymbolInfo | null {
    const scope = buildCodeScopeFilter(this.projectId, 's');
    const row = this.adapter.get<SymbolInfo>(`
      SELECT s.id, s.name, s.kind, f.relative_path as filePath
      FROM symbols s JOIN files f ON f.id = s.file_id
      WHERE s.id = ? AND ${scope.clause}
    `, [symbolId, ...scope.params]);
    return row ?? null;
  }

  /** Get symbol info for multiple IDs (tenant-scoped). */
  getSymbolInfoBatch(symbolIds: number[]): Map<number, SymbolInfo> {
    if (symbolIds.length === 0) return new Map();
    const scope = buildCodeScopeFilter(this.projectId, 's');
    const placeholders = symbolIds.map(() => '?').join(',');
    const rows = this.adapter.all<SymbolInfo>(`
      SELECT s.id, s.name, s.kind, f.relative_path as filePath
      FROM symbols s JOIN files f ON f.id = s.file_id
      WHERE s.id IN (${placeholders}) AND ${scope.clause}
    `, [...symbolIds, ...scope.params]);
    const map = new Map<number, SymbolInfo>();
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  /** Resolve a symbol name to its ID (tenant-scoped). */
  resolveSymbolId(name: string, filePath?: string): number | null {
    const scope = buildCodeScopeFilter(this.projectId, 's');
    let sql = `SELECT s.id FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? AND ${scope.clause}`;
    const params: unknown[] = [name, ...scope.params];
    if (filePath) { sql += ' AND f.relative_path LIKE ?'; params.push(`%${filePath}%`); }
    sql += ' LIMIT 1';
    const row = this.adapter.get<{ id: number }>(sql, params);
    return row?.id ?? null;
  }
}
