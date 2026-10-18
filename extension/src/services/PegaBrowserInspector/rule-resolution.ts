/**
 * Rule resolution via the Pega OOP class hierarchy REST API (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import type { BrowserInspectorConfig } from "./types";
import type { LogFn } from "./state";

/**
 * Resolve a rule reference via Pega OOP class hierarchy using REST API.
 * Calls POST /api/CodeIntelligence/v1/rules/query with query params.
 * Returns resolved pxInsName + pyClassName (actual apply class from resolution).
 */
export async function resolveRule(
  config: BrowserInspectorConfig, log: LogFn,
  objClass: string, appliesTo: string, ruleName: string,
): Promise<{ pxInsName: string; pyClassName: string; pzInsKey: string } | null> {
  const url = buildQueryUrl(config.pegaEndpoint, objClass, appliesTo, ruleName);
  const authHeader = buildAuthHeader(config.username, config.password);

  try {
    const resp = await fetchRuleResponse(url, authHeader);

    if (!resp.ok) {
      log(`[BrowserInspector] resolveRule: ${resp.status} for ${objClass}/${appliesTo}/${ruleName}`);
      return null;
    }

    return await parseRuleResponse(resp, log, ruleName, appliesTo);
  } catch (err: any) {
    log(`[BrowserInspector] resolveRule error: ${err.message}`);
    return null;
  }
}

/** Build the Basic auth header from credentials. */
function buildAuthHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

/** POST the rules/query request with basic auth. */
async function fetchRuleResponse(url: string, authHeader: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
  });
}

/** Build the rules/query REST URL from the Pega endpoint. */
function buildQueryUrl(
  pegaEndpoint: string, objClass: string, appliesTo: string, ruleName: string,
): string {
  const baseUrl = pegaEndpoint.replace(/\/PRServlet$/, "").replace(/\/prweb$/, "");
  return `${baseUrl}/prweb/api/CodeIntelligence/v1/rules/query`
    + `?pxObjClass=${encodeURIComponent(objClass)}`
    + `&appliesTo=${encodeURIComponent(appliesTo)}`
    + `&pyRuleName=${encodeURIComponent(ruleName)}`;
}

/** Parse the rule query response and log the resolution result. */
async function parseRuleResponse(
  resp: Response, log: LogFn, ruleName: string, appliesTo: string,
): Promise<{ pxInsName: string; pyClassName: string; pzInsKey: string }> {
  const json = await resp.json() as any;
  const pxInsName = json.pxInsName || "";
  const pyClassName = json.pyClassName || appliesTo;
  const pzInsKey = json.pzInsKey || "";

  log(`[BrowserInspector] resolveRule: ${ruleName} → ${pyClassName}/${pxInsName}`);
  return { pxInsName, pyClassName, pzInsKey };
}
