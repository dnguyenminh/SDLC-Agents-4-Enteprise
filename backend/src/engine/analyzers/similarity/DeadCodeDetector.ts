/**
 * KSA-168: Dead Code Detector — Find unreachable code using call graph reachability.
 * BFS from entry points through call graph, then score unreachable functions.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { DeadCodeCandidate, DeadCodeReport } from './types.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

interface FunctionInfo {
  id: number;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  isExported: boolean;
  isAsync: boolean;
  hasDecorators: boolean;
  hasTests: boolean;
}

export class DeadCodeDetector {
  private adapter: DatabaseAdapter;
  private minConfidence: number;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, minConfidence: number = 60, projectId?: string) {
    this.adapter = adapter;
    this.minConfidence = minConfidence;
    this.projectId = projectId;
  }

  /** Detect dead code with confidence scoring. */
  async detect(options: { filePath?: string; module?: string; limit?: number } = {}): Promise<DeadCodeReport> {
    const t0 = performance.now();

    // 1. Get all entry points
    const entryPointIds = await this.getEntryPoints();

    // 2. Compute reachability via BFS
    const reachable = await this.computeReachability(entryPointIds);

    // 3. Get all functions
    const allFunctions = await this.getAllFunctions(options.filePath, options.module);

    // 4. Find unreachable functions
    const unreachable = allFunctions.filter(f => !reachable.has(f.id));

    // 5. Score each candidate
    const candidates: DeadCodeCandidate[] = [];
    for (const func of unreachable) {
      const { confidence, reasons } = await this.scoreCandidate(func);
      if (confidence >= this.minConfidence) {
        candidates.push({
          symbolId: func.id,
          name: func.name,
          kind: func.kind,
          filePath: func.filePath,
          startLine: func.startLine,
          confidence,
          reasons,
        });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);
    const limit = options.limit ?? 50;

    const elapsed = performance.now() - t0;
    return {
      candidates: candidates.slice(0, limit),
      totalFunctions: allFunctions.length,
      reachableCount: reachable.size,
      unreachableCount: unreachable.length,
      scanDurationMs: Math.round(elapsed),
    };
  }

  private async getEntryPoints(): Promise<number[]> {
    const scope = buildCodeScopeFilter(this.projectId, 's'); // fail-closed
    try {
      const rows = await this.adapter.allAsync<{ symbol_id: number }>(`
        SELECT ep.symbol_id FROM entry_points ep
        JOIN symbols s ON s.id = ep.symbol_id
        WHERE ${scope.clause}
      `, [...scope.params]);
      return rows.map(r => r.symbol_id);
    } catch {
      // entry_points table may not exist — fall back to exported symbols (scoped)
      const rows = await this.adapter.allAsync<{ id: number }>(
        `SELECT id FROM symbols s WHERE is_exported = 1 AND ${scope.clause}`,
        [...scope.params],
      );
      return rows.map(r => r.id);
    }
  }

  private async computeReachability(entryPointIds: number[]): Promise<Set<number>> {
    const visited = new Set<number>();
    const queue: number[] = [...entryPointIds];

    // Load call graph edges (tenant-scoped, fail-closed)
    const edgeScope = buildCodeScopeFilter(this.projectId, 'relationships');
    const edges = await this.adapter.allAsync<{ source_symbol_id: number; target_symbol_id: number }>(`
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

  private async getAllFunctions(filePath?: string, module?: string): Promise<FunctionInfo[]> {
    const scope = buildCodeScopeFilter(this.projectId, 's'); // fail-closed
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

    const rows = await this.adapter.allAsync<{
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

  private async scoreCandidate(func: FunctionInfo): Promise<{ confidence: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    // No callers (already unreachable) — base score
    score += 40;
    reasons.push('no_callers');

    // Not exported — higher confidence it's dead
    if (!func.isExported) {
      score += 20;
      reasons.push('not_exported');
    }

    // Check if it has tests referencing it
    const hasTests = await this.hasTestReferences(func.id);
    if (!hasTests) {
      score += 15;
      reasons.push('no_tests');
    }

    // Has decorators — might be used via reflection/DI
    if (func.hasDecorators) {
      score -= 30;
      reasons.push('has_decorators_dynamic_dispatch');
    }

    // Check if name suggests it's a lifecycle/hook method
    if (this.isLifecycleMethod(func.name)) {
      score -= 25;
      reasons.push('lifecycle_method');
    }

    // Check if recently modified (within last 30 days via git)
    // Simplified: skip git check for now, can be enhanced later

    return { confidence: Math.max(0, Math.min(100, score)), reasons };
  }

  private async hasTestReferences(symbolId: number): Promise<boolean> {
    const scope = buildCodeScopeFilter(this.projectId, 'r'); // fail-closed
    try {
      const row = await this.adapter.getAsync<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM relationships r
        JOIN files f ON f.id = (SELECT file_id FROM symbols WHERE id = r.source_symbol_id)
        WHERE r.target_symbol_id = ?
          AND (f.relative_path LIKE '%test%' OR f.relative_path LIKE '%spec%')
          AND ${scope.clause}
      `, [symbolId, ...scope.params]);
      return (row?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private isLifecycleMethod(name: string): boolean {
    const lifecyclePatterns = [
      /^on[A-Z]/, /^handle[A-Z]/, /^before[A-Z]/, /^after[A-Z]/,
      /^init/, /^destroy/, /^setup/, /^teardown/,
      /^ngOn/, /^componentDid/, /^componentWill/,
      /^use[A-Z]/, // React hooks
    ];
    return lifecyclePatterns.some(p => p.test(name));
  }
}
