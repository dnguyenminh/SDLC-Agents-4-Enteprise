/**
 * DependencyMapper — Maps backend UnresolvedDependency to Extension CrawlPlanItem.
 * SA4E-156: Clean translation between backend/extension terminology.
 * Pattern: Mapper — stateless utility for domain object translation.
 */

import type { CrawlPlanItem } from "../models";

/**
 * Backend UnresolvedDependency shape (from POST /api/v1/pega/ingest-rule response).
 * Kept as interface here to avoid coupling extension to backend model file.
 */
export interface UnresolvedDependency {
  insKey?: string | null;
  ruleType: string;
  className: string;
  ruleName: string;
}

/**
 * Maps backend dependency discoveries to extension crawl items.
 * All methods are static — no state, pure transformation.
 */
export class DependencyMapper {
  /**
   * Convert UnresolvedDependency to CrawlPlanItem for fetchQueue.
   * insKey is constructed synthetically if not provided by backend.
   * @param dep - Backend discovery result
   * @returns CrawlPlanItem ready for fetchRulesInParallel
   */
  static toCrawlPlanItem(dep: UnresolvedDependency): CrawlPlanItem | null {
    const ruleName = (dep.ruleName || '').trim();
    if (!ruleName || ruleName.toLowerCase() === 'null' || ruleName.toLowerCase() === 'undefined') {
      return null;
    }
    const syntheticInsKey = `${dep.ruleType} ${dep.className} ${ruleName.toUpperCase()}`;
    const insKey = dep.insKey || syntheticInsKey;
    return {
      insKey,
      pxObjClass: dep.ruleType,
      pyClassName: dep.className,
      pyRuleName: ruleName,
    };
  }

  /**
   * Construct dedup key from UnresolvedDependency.
   * Format: "{ruleType}!{className}!{ruleName}" (BR-01 compatible).
   * @param dep - Backend discovery result
   */
  static dedupKey(dep: UnresolvedDependency): string {
    return `${dep.ruleType}!${dep.className}!${dep.ruleName}`;
  }

  /**
   * Construct dedup key from CrawlPlanItem (same format as dedupKey).
   * @param item - Extension crawl item
   */
  static dedupKeyFromItem(item: CrawlPlanItem): string {
    return `${item.pxObjClass}!${item.pyClassName}!${item.pyRuleName}`;
  }
}
