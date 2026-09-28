/**
 * PegaRuleListClient — Pega rule listing/enumeration operations (SA4E-323
 * refactor, extracted from PegaHttpClient). Free functions taking a
 * PegaHttpCore. Behavior-preserving.
 */

import type { PegaHttpCore } from "./PegaHttpCore";
import type { RuleSetRuleSummary } from "../../models";

/** Concrete rule types queried per RuleSet ("Rule-" base returns 0 results). */
const CONCRETE_TYPES = [
  "Rule-Obj-Property", "Rule-Obj-Activity", "Rule-Obj-Flow",
  "Rule-Obj-Model", "Rule-HTML-Section", "Rule-Declare-Expressions",
  "Rule-Obj-FieldValue", "Rule-Obj-Report-Definition", "Rule-Obj-Class",
];

/** Service 3: list rule summaries by class/application. */
export async function listApplicationRules(
  core: PegaHttpCore, pxObjClass: string, appliesTo = "", pageSize = 50, pageIndex = 1,
): Promise<Record<string, unknown>> {
  const authHeader = await core.getAuthHeader();
  for (const prefix of core.getCustomRestPrefixes()) {
    try {
      const qp = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo)}&pageSize=${pageSize}&pageIndex=${pageIndex}&RequestClass=${encodeURIComponent(pxObjClass)}&RequestAppliesTo=${encodeURIComponent(appliesTo)}`;
      const res = await core.fetchWithRetry(`${prefix}/rules/list?${qp}`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ruleJson: JSON.stringify({ RequestClass: pxObjClass, RequestAppliesTo: appliesTo, pageSize, pageIndex }) }),
      });
      if (res.ok) { const json = (await res.json()) as Record<string, unknown>; if (json && !json.error) { return json; } }
    } catch (err) { console.debug("[PegaHttpClient] try next prefix :", (err as Error).message); }
  }
  throw new Error("POST /rules/list failed on all custom REST prefixes");
}

/** Service 10: list rules matching a property filter with pagination. */
export async function listRulesByFilter(
  core: PegaHttpCore, objClass: string, filterPropName: string, filterPropValue: string, pageSize = 50, pageIndex = 1,
): Promise<{ pxResults: Record<string, unknown>[]; pxMore: boolean; totalCount?: number }> {
  const authHeader = await core.getAuthHeader();
  const logs: string[] = [];
  for (const prefix of core.getCustomRestPrefixes()) {
    const qp = `ObjClass=${encodeURIComponent(objClass)}&FilterPropName=${encodeURIComponent(filterPropName)}&FilterPropValue=${encodeURIComponent(filterPropValue)}&PageSize=${pageSize}&PageIndex=${pageIndex}&RequestClass=${encodeURIComponent(objClass)}`;
    const url = `${prefix}/rules/listRules?${qp}`;
    try {
      const res = await core.fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body: "",
      });
      const text = await res.text();
      core.log(`[PegaHttpClient] 📡 POST ${url} => HTTP ${res.status} (${text.length} bytes)`);
      if (res.ok) { return parseListResult(core, prefix, text, pageSize); }
      if (res.status === 401 || res.status === 403) { throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`); }
      logs.push(`POST ${url} => HTTP ${res.status}: ${text.substring(0, 150)}`);
    } catch (err: any) {
      if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403")) { throw err; }
      logs.push(`POST ${url} => Error: ${err.message}`);
    }
  }
  throw new Error(`POST /rules/listRules failed:\n  ${logs.join("\n  ")}`);
}

/** Parse a successful listRules body; locks the active prefix. */
function parseListResult(
  core: PegaHttpCore, prefix: string, text: string, pageSize: number,
): { pxResults: Record<string, unknown>[]; pxMore: boolean; totalCount?: number } {
  core.activePrefix = prefix;
  const json = JSON.parse(text) as Record<string, unknown>;
  const pxResults = (json.pxResults || json.results || []) as Record<string, unknown>[];
  const rawMore = json.pxMore;
  const pxMore = rawMore === true || rawMore === "true" || rawMore === "Yes" || rawMore === "yes"
    || (rawMore === undefined && Array.isArray(pxResults) && pxResults.length >= pageSize);
  const totalCount = typeof json.totalCount === "number" ? json.totalCount : undefined;
  return { pxResults: Array.isArray(pxResults) ? pxResults : [], pxMore, totalCount };
}

/** Enumerate all rules in a RuleSet by querying each concrete type in parallel. */
export async function listRulesByRuleSet(
  core: PegaHttpCore, ruleSetName: string, ruleSetVersion: string, pageSize = 200, pageIndex = 1,
): Promise<{ pxResults: RuleSetRuleSummary[]; pxMore: boolean; totalCount?: number }> {
  const allResults: RuleSetRuleSummary[] = [];
  let anyMore = false;
  const typeResults = await Promise.all(CONCRETE_TYPES.map(async (objClass) => {
    try { return await listRulesByFilter(core, objClass, "pyRuleSet", ruleSetName, pageSize, pageIndex); }
    catch (err) { console.debug("[PegaHttpClient] Rule listing failed (non-fatal):", (err as Error).message); return { pxResults: [] as Record<string, unknown>[], pxMore: false }; }
  }));
  for (const result of typeResults) {
    if (result.pxMore) { anyMore = true; }
    for (const r of result.pxResults) {
      allResults.push({
        pzInsKey: String(r.pzInsKey || ""), pxObjClass: String(r.pxObjClass || ""),
        pyClassName: String(r.pyClassName || ""), pyRuleName: String(r.pyRuleName || ""),
        pyRuleSet: String(r.pyRuleSet || ruleSetName), pyRuleSetVersion: String(r.pyRuleSetVersion || ruleSetVersion),
        pyLabel: r.pyLabel ? String(r.pyLabel) : undefined,
      });
    }
  }
  return { pxResults: allResults, pxMore: anyMore, totalCount: allResults.length };
}

/** All rules of a type belonging to a class (filtered by pyClassName). */
export async function getClassRules(
  core: PegaHttpCore, className: string, ruleType: string, pageSize = 200,
): Promise<Record<string, unknown>[]> {
  if (!className || className === "@baseclass" || className.length < 3) { return []; }
  try {
    const result = await listRulesByFilter(core, ruleType, "pyClassName", className, pageSize, 1);
    return Array.isArray(result.pxResults) ? result.pxResults : [];
  } catch (err) {
    console.debug("[PegaHttpClient] Failed to parse rule list response:", (err as Error).message);
    return [];
  }
}
