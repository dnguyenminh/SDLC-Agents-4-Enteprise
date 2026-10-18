/**
 * PegaCrawlHelper — Parallel fetch strategies for Pega rule crawling.
 * Extracts fetch logic from IndexingService to keep files under 200 lines
 * and enable concurrent rule retrieval (SA4E-92 performance fix).
 * Implementation lives in ./PegaCrawlHelper/*.
 */

export type { ParallelFetchResult, SubRuleFetched } from "./PegaCrawlHelper/types";
export { fetchRulesInParallel } from "./PegaCrawlHelper/parallel-fetch";
export { fetchRuleTypesInParallel } from "./PegaCrawlHelper/class-rules";
export { saveRuleFile } from "./PegaCrawlHelper/save-rule";
export { calibrateFetchConcurrency } from "./PegaCrawlHelper/calibration";
