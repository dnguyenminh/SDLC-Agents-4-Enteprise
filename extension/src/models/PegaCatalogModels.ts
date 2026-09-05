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
  /** SA4E-241: rule change timestamps (for checksum). Absent in legacy catalogs. */
  pxUpdateDateTime?: string;
  pxSaveDateTime?: string;
  /** SA4E-241: checksum column from the Pega service (Cách A). Verified/recomputed
   *  by the extension (Cách B). Absent → extension computes from the 3 fields. */
  checksum?: string;
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
    // pyRuleName MUST stay empty: the catalog gives an authoritative pzInsKey, and
    // fetchRulesInParallel fetches by insKey ONLY when pyRuleName is empty. Deriving
    // a name from pyLabel makes the crawler re-build a wrong insKey (class+name) and
    // 404/500. The exact pzInsKey from the catalog is the single source of truth.
    pyRuleName: "",
    pyRuleSet: row.pyRuleSet,
    pyRuleSetVersion: row.pyRuleSetVersion,
    pyLabel: row.pyLabel,
    pxUpdateDateTime: row.pxUpdateDateTime,
    pxSaveDateTime: row.pxSaveDateTime,
    checksum: row.checksum,
  };
}
