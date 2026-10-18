/**
 * Class sub-rule expansion for Pega crawling (SA4E-92).
 * Fetches all 9 rule types for a class in parallel.
 */

import type { PegaHttpClient } from "../PegaHttpClient";
import type { MembershipSet } from "../DiskBackedSet";
import type { LogFn, SubRuleFetched } from "./types";

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
