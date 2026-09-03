/**
 * PegaCrawlHelper — Parallel fetch strategies for Pega rule crawling.
 * Extracts fetch logic from IndexingService to keep files under 200 lines
 * and enable concurrent rule retrieval (SA4E-92 performance fix).
 */
import * as path from "path";
import * as fs from "fs";
import { parallelBatch } from "./parallel-utils";
import { computeOptimalConcurrency, measureLatency } from "./concurrency-tuner";
import type { PegaHttpClient } from "./PegaHttpClient";
import type { MembershipSet } from "./DiskBackedSet";

/** Computed at runtime — see computeFetchConcurrency() */
let FETCH_CONCURRENCY = 10; // default until measured

/** Rule types to crawl when a Class rule is encountered */
const RULE_TYPES_TO_CRAWL = [
    "Rule-Obj-Property",
    "Rule-Obj-Activity",
    "Rule-Obj-Flow",
    "Rule-Obj-Model",
    "Rule-HTML-Section",
    "Rule-Declare-Expressions",
    "Rule-Obj-FieldValue",
    "Rule-Obj-Report-Definition",
    "Rule-Service-REST",
] as const;

type LogFn = (msg: string) => void;

/** Item shape from crawlPlan response */
interface CrawlPlanItem {
    insKey: string;
    pxObjClass: string;
    pyClassName: string;
    pyRuleName: string;
}

/** Result of a successful rule fetch */
interface FetchedRule {
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

/**
 * Fetch rules in parallel with concurrency=5.
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

/**
 * Fetch all 9 rule types for a class in parallel (no concurrency limit needed
 * since it's only 9 requests, and they're independent).
 * Only returns rules not already in visitedKeys.
 */
export async function fetchRuleTypesInParallel(
    targetClassName: string,
    pegaClient: PegaHttpClient,
    visitedKeys: MembershipSet,
    log: LogFn,
): Promise<SubRuleFetched[]> {
    const results: SubRuleFetched[] = [];

    // Fire all 9 rule type requests in parallel
    const ruleTypeResults = await Promise.all(
        RULE_TYPES_TO_CRAWL.map(async (rt) => {
            try {
                const subRules = await pegaClient.getClassRules(targetClassName, rt);
                return { rt, subRules };
            } catch {
                return { rt, subRules: [] as Record<string, unknown>[] };
            }
        }),
    );

    // Process results sequentially (visitedKeys mutation needs to be serial)
    for (const { rt, subRules } of ruleTypeResults) {
        if (subRules.length === 0) { continue; }
        let newCount = 0;
        for (const sr of subRules) {
            const srInsKey = (sr as any).insKey
                || `${rt}:${targetClassName}:${(sr as any).pyRuleName || (sr as any).pyPropertyName || ''}`;
            if (!visitedKeys.has(srInsKey)) {
                visitedKeys.add(srInsKey);
                results.push({ rule: sr, ruleType: rt });
                newCount++;
            }
        }
        const dupCount = subRules.length - newCount;
        const dupInfo = dupCount > 0 ? ` (${dupCount} duplicates skipped)` : '';
        const sampleKeys = subRules.slice(0,3).map(s => (s as any).insKey || '').join('|');
        const sampleRule = subRules[0] || {};
        const sampleClass = (sampleRule as any).pyClassName || (sampleRule as any).pyAppliesTo || '';
        const sampleName = (sampleRule as any).pyRuleName || (sampleRule as any).pyPropertyName || '';
        log(`[Pega Indexer] 🐞 DEBUG Class "${targetClassName}" ${rt} sampleInsKeys=${sampleKeys} sampleClass=${sampleClass} sampleName=${sampleName} total=${subRules.length}`);
        log(`[Pega Indexer] 📌 Class "${targetClassName}": ${newCount}/${subRules.length} new rules of type "${rt}"${dupInfo}. Saving & ingesting...`);
    }

    return results;
}

/**
 * Save a Pega rule object as a .pega.json file in the workspace rules/ directory.
 * Idempotent: skips if file already exists.
 */
export function saveRuleFile(
    rObj: Record<string, unknown>,
    root: string,
    log: LogFn,
    fallbackClass?: string,
    fallbackName?: string,
): void {
    try {
        const objClass = (rObj.pxObjClass as string) || fallbackClass || "Rule";
        const ruleName = (rObj.pyRuleName as string)
            || (rObj.pyPropertyName as string)
            || (rObj.pyActivityName as string)
            || (rObj.pyFlowName as string)
            || (rObj.pyModelName as string)
            || (rObj.pyLabel as string)
            || fallbackName || "Rule";
        const safeClass = objClass.replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeName = ruleName.replace(/[^a-zA-Z0-9_.-]/g, "_");

        const targetDir = path.join(root, "rules", safeClass);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, `${safeName}.pega.json`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(rObj, null, 2), "utf-8");
            log(`[Pega Indexer] 💾 Saved ${safeClass}/${safeName}.pega.json`);
        }
    } catch (fileErr: any) {
        log(`[Pega Indexer] ⚠️ File save error: ${fileErr.message}`);
    }
}

/**
 * Classify a fetch error as "server" (abort-worthy) or "not_found" (skip).
 * Server errors indicate the Pega instance is unreachable or broken.
 */
function classifyFetchError(errMsg: string): "server" | "not_found" | "other" {
    const lower = errMsg.toLowerCase();
    const isNotFound = lower.includes("not found")
        || lower.includes("rule not found")
        || lower.includes("record not found");
    if (isNotFound) { return "not_found"; }

    const serverPatterns = [
        "503", "502", "504", "500", "401", "403",
        "econnrefused", "enotfound", "etimedout",
        "fetch failed", "network error",
        "failed to connect", "service temporarily unavailable",
    ];
    const isServer = serverPatterns.some((p) => lower.includes(p));
    return isServer ? "server" : "other";
}

/**
 * Calibrate fetch concurrency by measuring latency to the Pega server.
 * Call once before starting the crawl loop.
 */
export async function calibrateFetchConcurrency(
    pegaClient: PegaHttpClient,
    totalItems: number,
    log: LogFn,
): Promise<number> {
    try {
        // SA4E-241 SEC-03: probe uses the configured operator id (no hardcoded
        // default). If none is configured, skip the operator-record probe and use
        // the default concurrency (fail-safe, not fail-open).
        const probeOperatorId = pegaClient.getConfiguredUsername();
        if (!probeOperatorId) {
            log(`[Pega Indexer] ⚠️ No pegaUsername configured — skipping latency probe, using default FETCH_CONCURRENCY=${FETCH_CONCURRENCY}`);
            return FETCH_CONCURRENCY;
        }
        const latency = await measureLatency(
            () => pegaClient.getObject("DATA-ADMIN-OPERATOR-ID", probeOperatorId, "@baseclass").catch(() => null),
            2,
        );
        FETCH_CONCURRENCY = computeOptimalConcurrency({
            measuredLatencyMs: latency,
            totalItems,
            isRemote: true,
            targetDurationMs: 15_000,
            maxServerConnections: 15,
        });
        log(`[Pega Indexer] 🎯 Auto-tuned: latency=${Math.round(latency)}ms → FETCH_CONCURRENCY=${FETCH_CONCURRENCY}`);
    } catch {
        log(`[Pega Indexer] ⚠️ Latency probe failed — using default FETCH_CONCURRENCY=${FETCH_CONCURRENCY}`);
    }
    return FETCH_CONCURRENCY;
}
