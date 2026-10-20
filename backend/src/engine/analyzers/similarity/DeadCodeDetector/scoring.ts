/**
 * Confidence scoring for unreachable-function candidates (DeadCodeDetector).
 * Extracted (BR-18) — free functions taking the adapter; no behavior change.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter } from '../../../query/code-intel-isolation.js';
import type { FunctionInfo } from '../DeadCodeDetector.js';

export async function scoreCandidate(
  adapter: DatabaseAdapter, projectId: string | undefined, func: FunctionInfo,
): Promise<{ confidence: number; reasons: string[] }> {
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
  const hasTests = await hasTestReferences(adapter, projectId, func.id);
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
  if (isLifecycleMethod(func.name)) {
    score -= 25;
    reasons.push('lifecycle_method');
  }

  // Check if recently modified (within last 30 days via git)
  // Simplified: skip git check for now, can be enhanced later

  return { confidence: Math.max(0, Math.min(100, score)), reasons };
}

async function hasTestReferences(
  adapter: DatabaseAdapter, projectId: string | undefined, symbolId: number,
): Promise<boolean> {
  const scope = buildCodeScopeFilter(projectId, 'r'); // fail-closed
  try {
    const row = await adapter.getAsync<{ count: number }>(`
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

function isLifecycleMethod(name: string): boolean {
  const lifecyclePatterns = [
    /^on[A-Z]/, /^handle[A-Z]/, /^before[A-Z]/, /^after[A-Z]/,
    /^init/, /^destroy/, /^setup/, /^teardown/,
    /^ngOn/, /^componentDid/, /^componentWill/,
    /^use[A-Z]/, // React hooks
  ];
  return lifecyclePatterns.some(p => p.test(name));
}
