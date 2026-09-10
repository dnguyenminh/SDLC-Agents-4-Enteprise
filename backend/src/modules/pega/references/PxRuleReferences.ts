/**
 * PxRuleReferences.ts — Engine-authoritative dependency extraction (SA4E-235 / GD3).
 *
 * The Pega engine computes `pxRuleReferences` on every rule instance at save/assembly time
 * (mirrored to the Index-Reference class). It is the source of truth for rule-to-rule
 * dependencies, so we read what the engine already recorded rather than re-deriving links by
 * inspecting per-type properties (the fragile heuristic that REFERENCE_FIELD_MAP represents).
 *
 * Ported from the standalone pega-rule-parser POC (src/references.ts). Output shape is the
 * existing `UnresolvedDependency` so PegaIndexer / API responses keep their contract.
 */

import type { UnresolvedDependency } from '../models.js';

/**
 * Rule types treated as "noise" for the dependency graph — real references, but structural
 * data-model links rather than behavioral rule-to-rule flow. Filtered out by default.
 */
export const DEFAULT_NOISE_TYPES: ReadonlySet<string> = new Set([
  'Rule-Obj-Property',
  'Rule-Obj-Class',
  'Rule-Obj-FieldValue',
  'Rule-Application-UseCase',
  'Rule-DataObject',
]);

/** Shape of a single raw entry in the `pxRuleReferences` array. */
interface RawRuleReferenceEntry {
  pxRuleObjClass?: string;
  pyRuleName?: string;
  pxRuleClassName?: string;
  pxRuleFamilyName?: string;
}

/** True when the rule JSON carries a usable `pxRuleReferences` aggregate. */
export function hasRuleReferences(json: Record<string, unknown>): boolean {
  const list = json?.pxRuleReferences;
  return Array.isArray(list) && list.length > 0;
}

/**
 * Extract dependency edges from the engine-authoritative `pxRuleReferences` aggregate.
 * Filters noise types, drops self-references, and de-duplicates identical targets.
 *
 * @param json Full parsed rule JSON
 * @param noiseTypes Rule types to exclude (default: {@link DEFAULT_NOISE_TYPES})
 * @returns Dependencies in the standard UnresolvedDependency shape
 */
export function extractDependenciesFromReferences(
  json: Record<string, unknown>,
  noiseTypes: ReadonlySet<string> = DEFAULT_NOISE_TYPES,
): UnresolvedDependency[] {
  const rawList = json?.pxRuleReferences;
  if (!Array.isArray(rawList)) return [];

  const selfName = (json.pyRuleName as string) || '';
  const selfClass = (json.pyClassName as string) || '';
  const selfType = (json.pxObjClass as string) || '';

  const deps: UnresolvedDependency[] = [];
  const seen = new Set<string>();

  for (const entry of rawList as RawRuleReferenceEntry[]) {
    const ruleType = entry?.pxRuleObjClass || '';
    const ruleName = entry?.pyRuleName || '';
    if (!ruleType || !ruleName) continue; // incomplete reference entry
    if (noiseTypes.has(ruleType)) continue; // structural noise

    const className = entry?.pxRuleClassName || '@baseclass';

    // Drop self-reference (rule pointing at itself).
    if (ruleType === selfType && ruleName === selfName && className === selfClass) continue;

    // De-dup identical targets (Pega often lists the same reference many times).
    const key = `${ruleType}:${className}:${ruleName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deps.push({ ruleType, className, ruleName });
  }

  return deps;
}
