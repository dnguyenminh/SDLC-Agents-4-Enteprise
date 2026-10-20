/**
 * Small lookup/format helpers for PegaRuleUnderstandingService.
 * Extracted (BR-18) — pure functions; no behavior change.
 */

import type { ResolvedDependency } from '../../references/PegaReferenceExtractor.js';

export function extractRuleName(json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyActivityName as string)
    || (json.pyModelName as string)
    || (json.pyTransformName as string)
    || (json.pyFlowName as string)
    || (json.pyLabel as string)
    || 'Unnamed';
}

export function buildDependencyGraphText(deps: ResolvedDependency[]): string {
  if (deps.length === 0) return '';
  const entries = deps.map(d => `${d.type}:${d.name}`);
  return entries.join('; ');
}
