/**
 * PegaCatalogModels — Models for the Rule Catalog Export API flow.
 * The export produces a CSV catalog (metadata per rule) that is parsed into
 * RuleSetRuleSummary items, then fed into the existing crawl+ingest pipeline.
 */
import type { RuleSetRuleSummary } from "./PegaCrawlModels";

/**
 * Export job lifecycle states returned by the /status endpoint.
 * Observed values (uppercase): QUEUED → RUNNING → DONE | FAILED.
 */
export type ExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "UNKNOWN";

/**
 * Column indices of rulecatalog.csv (16-column header, order fixed by server).
 * Header: pzInsKey,pxObjClass,pyClassName,pyRuleSet,pyRuleSetVersion,pyRuleAvailable,
 *   pyBaseRule,pyCircumstanceType,pyCircumstanceProp,pyCircumstanceVal,
 *   pyCircumstanceDateProp,pyCircumstanceDate,pyRuleStarts,pyRuleEnds,pyLabel,pxCreateDateTime
 */
export const CATALOG_COLUMNS = {
  pzInsKey: 0,
  pxObjClass: 1,
  pyClassName: 2,
  pyRuleSet: 3,
  pyRuleSetVersion: 4,
  pyLabel: 14,
} as const;

/**
 * A single parsed row from rulecatalog.csv.
 * Mirrors the subset of columns needed to build a crawl item.
 */
export interface RuleCatalogRow {
  pzInsKey: string;
  pxObjClass: string;
  pyClassName: string;
  pyRuleSet: string;
  pyRuleSetVersion: string;
  pyLabel?: string;
}

/**
 * Convert a parsed catalog row into the enumeration summary shape
 * already consumed by summaryToCrawlItem().
 * @param row - Parsed rulecatalog.csv row
 */
export function catalogRowToSummary(row: RuleCatalogRow): RuleSetRuleSummary {
  return {
    pzInsKey: row.pzInsKey,
    pxObjClass: row.pxObjClass,
    pyClassName: row.pyClassName,
    // pyRuleName is not a catalog column — derive from label (best-effort).
    // The crawl fetches by insKey when pyRuleName is empty (PegaCrawlHelper).
    pyRuleName: row.pyLabel || "",
    pyRuleSet: row.pyRuleSet,
    pyRuleSetVersion: row.pyRuleSetVersion,
    pyLabel: row.pyLabel,
  };
}
