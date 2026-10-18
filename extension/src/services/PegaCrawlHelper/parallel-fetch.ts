/**
 * Parallel rule fetch with auto-tuned concurrency (SA4E-92).
 * Concurrency is calibrated at runtime by calibrateFetchConcurrency().
 */

import { parallelBatch } from "../parallel-utils";
import type { PegaHttpClient } from "../PegaHttpClient";
import { classifyFetchError } from "./fetch-error";
import type { CrawlPlanItem, FetchedRule, LogFn, ParallelFetchResult } from "./types";

/** Computed at runtime — see calibrateFetchConcurrency() */
let FETCH_CONCURRENCY = 10; // default until measured

export function getFetchConcurrency(): number {
    return FETCH_CONCURRENCY;
}

export function setFetchConcurrency(value: number): void {
    FETCH_CONCURRENCY = value;
}

/**
 * Fetch rules in parallel with calibrated concurrency.
 * Server errors (5xx, connection failures) abort all remaining fetches.
 * Not-found errors are logged and skipped.
 */
export async function fetchRulesInParallel(
    chunk: CrawlPlanItem[],
    pegaClient: PegaHttpClient,
    log: LogFn,
    abortOnServerError = true,
): Promise<ParallelFetchResult> {
    const fetched: FetchedRule[] = [];
    let serverError: string | null = null;

    await parallelBatch(chunk, FETCH_CONCURRENCY, async (item) => {
        // Early exit: if a previous item detected a server error, skip.
        // Catalog-sourced runs pass abortOnServerError=false so a single 5xx on one
        // rule does not discard the whole authoritative rule list.
        if (serverError) { return null; }

        // Purpose: fetch full rule JSON by insKey to index into KB
        const purpose = item.pxObjClass.startsWith("Rule-OBJ-CLASS") || item.pxObjClass === "Rule-Obj-Class"
            ? `[Class Definition] Fetching class rule to expand sub-rules (properties, activities, flows...)`
            : `[Rule Content] Fetching rule content to index into KB`;
        log(`[Pega Indexer] ⬇️ ${purpose}`);
        log(`[Pega Indexer]    → Type: ${item.pxObjClass} | AppliesTo: ${item.pyClassName} | Name: ${item.pyRuleName} | insKey: ${item.insKey}`);
        try {
            // Use insKey directly when pyRuleName is empty (enumeration-sourced items)
            const ruleObj = item.pyRuleName
                ? await pegaClient.getObject(item.pxObjClass, item.pyRuleName, item.pyClassName)
                : await pegaClient.getRuleByInsKey(item.insKey);
            if (ruleObj && (ruleObj.error || ruleObj.pyHTTPResponseCode === "404" || ruleObj.pyHTTPResponseCode === 404)) {
                throw new Error(String(ruleObj.error || "Rule not found on Pega Server"));
            }
            const ruleName = (ruleObj.pyRuleName as string) || (ruleObj.pyLabel as string) || item.pyRuleName;
            const jsonStr = JSON.stringify(ruleObj);
            log(`[Pega Indexer] ✅ Downloaded ${ruleObj.pxObjClass || item.pxObjClass} "${ruleName}" (${jsonStr.length} bytes)`);
            fetched.push({ ruleObj, item });
            return ruleObj;
        } catch (err: any) {
            const errMsg = String(err.message || err);
            const errorCategory = classifyFetchError(errMsg);

            if (errorCategory === "server" && abortOnServerError) {
                log(`[Pega Indexer] ⛔ Server Error — ${errMsg.substring(0, 150)}. Aborting crawl.`);
                serverError = `Pega Server Connection Failed: ${errMsg.split("\n")[0]}`;
            } else if (errorCategory === "server") {
                // Resilient mode (catalog): log and skip this rule, keep processing the rest.
                log(`[Pega Indexer] ⚠️ Server error on "${item.insKey}" — skipping (catalog resilient mode): ${errMsg.substring(0, 120)}`);
            } else {
                const hasSpaceInName = item.pyRuleName.includes(" ") || (item.insKey.split(" ").length > 2 && !item.insKey.includes("-Work-"));
                const hint = hasSpaceInName
                    ? ` ⚠️ Short name like "Payroll Setup" — Pega needs FQN class (e.g. TGB-HRApps-Work-PayrollSetup). Will resolve from App Rule dependencies.`
                    : (item.pyClassName === "@baseclass" && !item.pyRuleName.includes("-"))
                    ? ` ⚠️ Short name "${item.pyRuleName}" — Pega needs FQN class. Will resolve from App Rule dependencies.`
                    : ``;
                log(`[Pega Indexer] ❌ Not found: ${item.pxObjClass} | appliesTo="${item.pyClassName}" | name="${item.pyRuleName}"${hint}`);
                log(`[Pega Indexer]    Tried insKey: "${item.insKey}" → ${errMsg}`);
            }
            return null;
        }
    });

    return { fetched, serverError };
}
