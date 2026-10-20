/**
 * Call-graph queries + BFS reachability for DeadCodeDetector.
 * Extracted (BR-18) — free functions taking the adapter; no behavior change.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter } from '../../../query/code-intel-isolation.js';
import type { FunctionInfo } from '../DeadCodeDetector.js';

export async function getEntryPoints(adapter: DatabaseAdapter, projectId: string | undefined): Promise<number[]> {
  const scope = buildCodeScopeFilter(projectId, 's'); // fail-closed
  try {
    const rows = await adapter.allAsync<{ symbol_id: number }>(`
      SELECT ep.symbol_id FROM entry_points ep
      JOIN symbols s ON s.id = ep.symbol_id
      WHERE ${scope.clause}
    `, [...scope.params]);
    return rows.map(r => r.symbol_id);
  } catch {
    // entry_points table may not exist — fall back to exported symbols (scoped)
    const rows = await adapter.allAsync<{ id: number }>(
      `SELECT id FROM symbols s WHERE is_exported = 1 AND ${scope.clause}`,
      [...scope.params],
    );
    return rows.map(r => r.id);
  }
}

export async function computeReachability(
  adapter: DatabaseAdapter, projectId: string | undefined, entryPointIds: number[],
): Promise<Set<number>> {
  const visited = new Set<number>();
  const queue: number[] = [...entryPointIds];

  // Load call graph edges (tenant-scoped, fail-closed)
  const edgeScope = buildCodeScopeFilter(projectId, 'relationships');
  const edges = await adapter.allAsync<{ source_symbol_id: number; target_symbol_id: number }>(`
    SELECT source_symbol_id, target_symbol_id
    FROM relationships
    WHERE kind = 'calls' AND target_symbol_id IS NOT NULL AND ${edgeScope.clause}
  `, [...edgeScope.params]);

  // Build adjacency list (caller → callees)
  const callGraph = new Map<number, number[]>();
  for (const edge of edges) {
    if (!callGraph.has(edge.source_symbol_id)) callGraph.set(edge.source_symbol_id, []);
    callGraph.get(edge.source_symbol_id)!.push(edge.target_symbol_id);
  }

  // BFS
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);

    const callees = callGraph.get(node);
    if (callees) {
      for (const callee of callees) {
        if (!visited.has(callee)) queue.push(callee);
      }
    }
  }

  return visited;
}

export async function getAllFunctions(
  adapter: DatabaseAdapter, projectId: string | undefined,
  filePath?: string, module?: string,
): Promise<FunctionInfo[]> {
  const scope = buildCodeScopeFilter(projectId, 's'); // fail-closed
  let sql = `
    SELECT s.id, s.name, s.kind, f.relative_path as filePath, s.start_line as startLine,
           s.is_exported as isExported, s.is_async as isAsync, s.decorators
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE s.kind IN ('function', 'method', 'arrow_function', 'generator')
      AND ${scope.clause}
  `;
  const params: unknown[] = [...scope.params];

  if (filePath) {
    sql += ` AND f.relative_path LIKE ?`;
    params.push(`%${filePath}%`);
  }
  if (module) {
    sql += ` AND f.module = ?`;
    params.push(module);
  }

  const rows = await adapter.allAsync<{
    id: number; name: string; kind: string; filePath: string; startLine: number;
    isExported: number; isAsync: number; decorators: string | null;
  }>(sql, params);

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    filePath: r.filePath,
    startLine: r.startLine,
    isExported: r.isExported === 1,
    isAsync: r.isAsync === 1,
    hasDecorators: !!r.decorators,
    hasTests: false, // Will be checked in scoring
  }));
}
