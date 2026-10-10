/**
 * PegaRuleReadClient — Pega single-rule read/query operations (SA4E-323
 * refactor, extracted from PegaHttpClient). Free functions taking a
 * PegaHttpCore so the shared activePrefix state stays single-owned.
 * Behavior-preserving.
 */

import type { PegaHttpCore } from "./PegaHttpCore";
import { looksLikeNotFoundBody, extractBodyError, unwrapQueryResult } from "./pega-response-utils";

const FATAL = ["HTTP 401", "HTTP 403", "HTTP 504", "HTTP 503", "HTTP 502", "HTTP 500"];

/** Resolve a rule: query by triple when no version, else by insKey with fallback. */
export async function getObject(
  core: PegaHttpCore, className: string, key: string, appliesTo?: string,
): Promise<Record<string, unknown>> {
  // Keep '@baseclass' verbatim: the CodeIntelligence rules/query service matches
  // appliesTo exactly — stripping it yields 0 results (SA4E-350 evidence).
  const wasBaseclass = appliesTo === "@baseclass";
  const cleanAppliesTo = appliesTo || "";
  const insKey = key.includes(" ") ? key
    : cleanAppliesTo ? `${className.toUpperCase()} ${cleanAppliesTo} ${key.toUpperCase()}`
    : `${className.toUpperCase()} ${key.toUpperCase()}`;
  if (insKey.includes("#") || key.includes("#")) {
    return getRuleByInsKeyWithTripleFallback(core, insKey, className, cleanAppliesTo, key, wasBaseclass);
  }
  const row = await queryByTripleWithCompatRetry(core, className, cleanAppliesTo, key, wasBaseclass);
  return fetchFullRuleIfHandleRow(core, row);
}

/** insKey path with triple fallback on non-fatal errors (fail-loud on auth/5xx). */
async function getRuleByInsKeyWithTripleFallback(
  core: PegaHttpCore, insKey: string, className: string, appliesTo: string, key: string, wasBaseclass: boolean,
): Promise<Record<string, unknown>> {
  try {
    return await getRuleByInsKey(core, insKey);
  } catch (err: any) {
    if (FATAL.some((f) => err.message.includes(f))) { throw err; }
    return queryByTripleWithCompatRetry(core, className, appliesTo, key, wasBaseclass);
  }
}

/**
 * Triple query with the exact appliesTo first; when '@baseclass' misses, retry
 * with an empty appliesTo (older service builds match empty-as-any). Auth/5xx
 * failures rethrow without retry (fail-loud, SA4E-349 pattern).
 */
async function queryByTripleWithCompatRetry(
  core: PegaHttpCore, className: string, appliesTo: string, key: string, wasBaseclass: boolean,
): Promise<Record<string, unknown>> {
  try {
    return await queryRuleByTriple(core, className, appliesTo, key);
  } catch (err: any) {
    if (!wasBaseclass || FATAL.some((f) => err.message.includes(f))) { throw err; }
    return queryRuleByTriple(core, className, "", key);
  }
}

/** Handle-only fields returned by the rules/query service (no rule content). */
const HANDLE_FIELDS = new Set([
  "pxObjClass", "pxUpdateDateTime", "pxUpdateOperator", "pyClass", "pyClassName",
  "pyRuleAvailable", "pyRuleName", "pyRuleSet", "pyRuleSetVersion", "pzInsKey",
]);

/**
 * Follow up a triple-query handle row with a full instance fetch — the row has
 * no rule content, and /rules/instance with the row's full pzInsKey returns the
 * complete rule JSON (SA4E-350 evidence). Falls back to the row when the fetch
 * fails (soft — the handle is still usable for indexing).
 */
async function fetchFullRuleIfHandleRow(
  core: PegaHttpCore, row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const keys = Object.keys(row);
  if (keys.length === 0 || !keys.every((k) => HANDLE_FIELDS.has(k))) { return row; }
  const insKey = (row.pzInsKey ?? row.insKey) as string | undefined;
  if (!insKey) { return row; }
  try { return await getRuleByInsKey(core, insKey); } catch { return row; }
}

/** Service 1: resolve a rule by its insKey handle across all prefixes. */
export async function getRuleByInsKey(core: PegaHttpCore, insKey: string): Promise<Record<string, unknown>> {
  const authHeader = await core.getAuthHeader();
  const logs: string[] = [];
  for (const prefix of core.getCustomRestPrefixes()) {
    const url = `${prefix}/rules/instance?insKey=${encodeURIComponent(insKey)}`;
    try {
      const res = await core.fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ insKey, RequestPZInsKey: insKey }),
      });
      const text = await res.text();
      core.log(`[PegaHttpClient] 📡 POST ${url} => HTTP ${res.status} (${text.length} bytes)`);
      const hit = interpretInsKeyResponse(core, prefix, url, insKey, res, text, logs);
      if (hit) { return hit; }
    } catch (err: any) {
      if (isFatalInsKey(err)) { throw err; }
      logs.push(`POST ${url} => Network Error: ${err.message}`);
    }
  }
  throw new Error(`Rule not found: ${insKey}\n  ${logs.join("\n  ")}`);
}

/** Interpret one getRuleByInsKey response; returns the rule or null to continue. */
function interpretInsKeyResponse(
  core: PegaHttpCore, prefix: string, url: string, insKey: string, res: Response, text: string, logs: string[],
): Record<string, unknown> | null {
  if (res.status === 401 || res.status === 403) { throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`); }
  if (res.status >= 500 && res.status <= 504) {
    if (looksLikeNotFoundBody(text)) { throw new Error(`Rule not found: ${insKey} (Pega ${extractBodyError(text) || `HTTP ${res.status}`})`); }
    throw new Error(`HTTP ${res.status} ${res.statusText || "Server Error"} at ${url} — body: ${text.substring(0, 200)}`);
  }
  if (res.ok) {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json && !json.error && json.pyHTTPResponseCode !== "404" && json.pyHTTPResponseCode !== 404) {
      core.activePrefix = prefix; return json;
    }
    if (prefix === core.activePrefix) { throw new Error(`Rule not found: ${insKey}`); }
    logs.push(`POST ${prefix} => 200 body error`); return null;
  }
  if (res.status === 404 && prefix === core.activePrefix) { throw new Error(`Rule not found: ${insKey}`); }
  logs.push(`POST ${prefix} => HTTP ${res.status}`); return null;
}

function isFatalInsKey(err: Error): boolean {
  return FATAL.some((f) => err.message.includes(f)) || err.message.includes("Rule not found");
}

/** Service 2: query a rule by class/appliesTo/name triple across all prefixes. */
export async function queryRuleByTriple(
  core: PegaHttpCore, pxObjClass: string, appliesTo: string, pyRuleName: string,
): Promise<Record<string, unknown>> {
  const authHeader = await core.getAuthHeader();
  const nf = `Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}`;
  const logs: string[] = [];
  for (const prefix of core.getCustomRestPrefixes()) {
    const qp = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo || "")}&pyRuleName=${encodeURIComponent(pyRuleName)}&RequestClass=${encodeURIComponent(pxObjClass)}&RequestAppliesTo=${encodeURIComponent(appliesTo || "")}&RequestRuleName=${encodeURIComponent(pyRuleName)}`;
    const url = `${prefix}/rules/query?${qp}`;
    const body = JSON.stringify({ ruleJson: JSON.stringify({ RequestClass: pxObjClass, RequestAppliesTo: appliesTo, RequestRuleName: pyRuleName }) });
    try {
      const res = await core.fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
      const text = await res.text();
      core.log(`[PegaHttpClient] 📡 POST ${url} => HTTP ${res.status} (${text.length} bytes)`);
      const hit = interpretTripleResponse(core, prefix, nf, res, text, logs);
      if (hit) { return hit; }
    } catch (err: any) {
      if (FATAL.some((f) => err.message.includes(f)) || err.message.includes(nf)) { throw err; }
      logs.push(`POST ${url} => Network Error: ${err.message}`);
    }
  }
  throw new Error(`${nf}\n  ${logs.join("\n  ")}`);
}

/** Interpret one queryRuleByTriple response; returns the rule or null to continue. */
function interpretTripleResponse(
  core: PegaHttpCore, prefix: string, nf: string, res: Response, text: string, logs: string[],
): Record<string, unknown> | null {
  if (res.status === 401 || res.status === 403) { throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`); }
  if (res.status >= 500 && res.status <= 504) {
    if (looksLikeNotFoundBody(text)) { throw new Error(`${nf} (Pega ${extractBodyError(text) || `HTTP ${res.status}`})`); }
    throw new Error(`HTTP ${res.status} ${res.statusText || "Server Error"} — body: ${text.substring(0, 200)}`);
  }
  if (res.ok) {
    if (!text || !text.trim()) { if (prefix === core.activePrefix) { throw new Error(nf); } logs.push("200 empty body"); return null; }
    let json: Record<string, unknown>;
    try { json = JSON.parse(text); } catch { if (prefix === core.activePrefix) { throw new Error(nf); } logs.push("200 invalid JSON"); return null; }
    if (json && !json.error && json.pyHTTPResponseCode !== "404" && json.pyHTTPResponseCode !== 404) {
      const unwrapped = unwrapQueryResult(json);
      if (unwrapped) { core.activePrefix = prefix; return unwrapped; }
    }
    if (prefix === core.activePrefix) { throw new Error(nf); }
    logs.push("200 body error / empty list"); return null;
  }
  if (res.status === 404 && prefix === core.activePrefix) { throw new Error(nf); }
  logs.push(`HTTP ${res.status}`); return null;
}
