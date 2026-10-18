/**
 * Shared types for PegaCrawlHelper (SA4E-92, SA4E-241).
 */

export type LogFn = (msg: string) => void;

/** Item shape from crawlPlan response.
 *  SA4E-241: `checksum` carries the catalog-resolved checksum (computePegaChecksum)
 *  so it can flow through fetch → ingest and be stored as content_hash (INV-1).
 *  Kept structurally in sync with models/PegaCrawlModels.CrawlPlanItem. */
export interface CrawlPlanItem {
    insKey: string;
    pxObjClass: string;
    pyClassName: string;
    pyRuleName: string;
    checksum?: string;
}

/** Result of a successful rule fetch */
export interface FetchedRule {
    ruleObj: Record<string, unknown>;
    item: CrawlPlanItem;
}

/** Aggregated result from parallel rule fetches */
export interface ParallelFetchResult {
    fetched: FetchedRule[];
    /** If a server error was detected, contains the error message to throw */
    serverError: string | null;
}

/** Sub-rule fetched from a class expansion */
export interface SubRuleFetched {
    rule: Record<string, unknown>;
    ruleType: string;
}
