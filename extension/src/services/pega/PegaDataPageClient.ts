/**
 * PegaDataPageClient — Pega DataPage + CodeIntelligence hierarchy queries
 * (SA4E-323 refactor, extracted from PegaHttpClient). Free functions taking a
 * PegaHttpCore. Behavior-preserving.
 */

import type { PegaHttpCore } from "./PegaHttpCore";

/** SA4E-156: enumerate all rules for an application via D_LatestRules4ExactedApps. */
export async function callDataPage(core: PegaHttpCore, appName: string): Promise<Record<string, unknown>> {
  const base = core.getPegaEndpoint();
  const authHeader = await core.getAuthHeader();
  const endpoints = [
    `${base}/api/v1/data/D_LatestRules4ExactedApps`,
    `${base}/PRRestService/api/v1/data/D_LatestRules4ExactedApps`,
  ];
  for (const url of endpoints) {
    try {
      const res = await core.fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ApplicationNames: appName }),
      });
      if (res.status === 401 || res.status === 403) { throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`); }
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        if (json && !json.error) { core.log(`[PegaHttpClient] ✅ DataPage success: ${url}`); return json; }
      }
    } catch (err: any) {
      if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403")) { throw err; }
      core.log(`[PegaHttpClient] DataPage attempt failed: ${err.message}`);
    }
  }
  throw new Error(`DataPage D_LatestRules4ExactedApps failed on all endpoints for app "${appName}"`);
}

/** Fetch parent class hierarchy via D_pzInheritanceListofClass. */
export async function fetchClassHierarchy(core: PegaHttpCore, className: string): Promise<string[]> {
  if (!className || className === "@baseclass") { return []; }
  const base = core.getPegaEndpoint();
  const authHeader = await core.getAuthHeader();
  const endpoints = [
    `${base}/api/CodeIntelligence/v1/datapage/list?dataPageName=D_pzInheritanceListofClass`,
    `${base}/PRRestService/CodeIntelligence/v1/datapage/list?dataPageName=D_pzInheritanceListofClass`,
  ];
  for (const url of endpoints) {
    try {
      const res = await core.fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: authHeader, Accept: "application/json", "Content-Type": "text/plain" },
        body: JSON.stringify({ classname: className }),
      });
      if (!res.ok) { continue; }
      const json = (await res.json()) as Record<string, unknown>;
      const results = json.pxResults as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) { continue; }
      return results.map((r) => r.pyClassName as string).filter((n) => n && n !== className && n !== "@baseclass");
    } catch (err: any) { core.log(`[PegaHttpClient] fetchClassHierarchy attempt failed: ${err.message}`); }
  }
  return [];
}

/** SA4E-173: fetch data-class pzInsKeys from D_pyDataTypesOfApp. */
export async function fetchDataTypesOfApp(core: PegaHttpCore, appName: string, appVersion: string): Promise<string[]> {
  const base = core.getPegaEndpoint();
  const authHeader = await core.getAuthHeader();
  const dotVersion = appVersion.replace(/-/g, ".");
  const url = `${base}/api/CodeIntelligence/v1/datapage/list?dataPageName=D_pyDataTypesOfApp`;
  try {
    const res = await core.fetchWithRetry(url, {
      method: "POST",
      headers: { Authorization: authHeader, Accept: "application/json", "Content-Type": "text/plain" },
      body: JSON.stringify({ AppVersion: dotVersion, AppName: appName }),
    });
    if (!res.ok) { return []; }
    const json = (await res.json()) as Record<string, unknown>;
    const results = json.pxResults as Array<Record<string, unknown>> | undefined;
    return Array.isArray(results) ? results.map((r) => r.pzInsKey as string).filter(Boolean) : [];
  } catch (err: any) { core.log(`[PegaHttpClient] fetchDataTypesOfApp failed: ${err.message}`); return []; }
}

/** SA4E-173: fetch direct children (categories or rules) for a class. */
export async function fetchDirectChildren(
  core: PegaHttpCore, className: string, categoryLevel1?: string, categoryLevel2?: string,
): Promise<Array<Record<string, unknown>>> {
  const base = core.getPegaEndpoint();
  const authHeader = await core.getAuthHeader();
  let params = `.ClassName=${encodeURIComponent(className)}`;
  if (categoryLevel1) { params += `&.CategoryLevel1=${encodeURIComponent(categoryLevel1)}`; }
  if (categoryLevel2) { params += `&.CategoryLevel2=${encodeURIComponent(categoryLevel2)}`; }
  const url = `${base}/api/CodeIntelligence/v1/rules/directChildren?${params}`;
  try {
    const res = await core.fetchWithRetry(url, { method: "POST", headers: { Authorization: authHeader, Accept: "application/json" }, body: "" });
    if (!res.ok) { return []; }
    const json = (await res.json()) as Record<string, unknown>;
    const results = json.pxResults as Array<Record<string, unknown>> | undefined;
    return Array.isArray(results) ? results : [];
  } catch (err: any) { core.log(`[PegaHttpClient] fetchDirectChildren failed: ${err.message}`); return []; }
}

/** SA4E-173: query rule pzInsKeys by type/appliesTo/name. */
export async function queryRuleInsKeys(
  core: PegaHttpCore, pxObjClass: string, appliesTo: string, pyRuleName: string,
): Promise<string[]> {
  const base = core.getPegaEndpoint();
  const authHeader = await core.getAuthHeader();
  const params = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo)}&pyRuleName=${encodeURIComponent(pyRuleName)}`;
  const url = `${base}/api/CodeIntelligence/v1/rules/query?${params}`;
  try {
    const res = await core.fetchWithRetry(url, { method: "POST", headers: { Authorization: authHeader, Accept: "application/json" }, body: "" });
    if (!res.ok) { return []; }
    const json = (await res.json()) as Record<string, unknown>;
    const results = json.pxResults as Array<Record<string, unknown>> | undefined;
    return Array.isArray(results) ? results.map((r) => r.pzInsKey as string).filter(Boolean) : [];
  } catch (err: any) { core.log(`[PegaHttpClient] queryRuleInsKeys failed: ${err.message}`); return []; }
}
