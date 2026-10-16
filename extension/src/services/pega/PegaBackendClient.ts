/**
 * PegaBackendClient — calls to the Code Intelligence backend for Pega rule
 * caching/crawling (SA4E-323 refactor, extracted from PegaHttpClient). Free
 * functions taking a PegaHttpCore. Behavior-preserving.
 *
 * SA4E-362 FR-7 (T-1): every exported function takes an optional trailing
 * `auth?: IngestAuthProvider` — when supplied, the fetch goes through the shared
 * `withAuthRetry` helper (HTTP 401 → refresh exactly once → retry exactly once).
 * Return contracts are UNCHANGED (401 persists → `!res.ok` branches as before).
 */

import type { PegaHttpCore } from "./PegaHttpCore";
import { withAuthRetry, type IngestAuthProvider } from "../../utils/backend-auth-headers";

/** POST JSON to a backend endpoint and return the parsed `data` field. */
async function postBackend(
  core: PegaHttpCore, path: string, body: Record<string, unknown>, auth?: IngestAuthProvider,
): Promise<{ res: Response; json: any }> {
  const { buildBackendAuthHeaders } = await import("../../utils/backend-auth-headers");
  const baseHeaders: Record<string, string> = { ...buildBackendAuthHeaders(), "Content-Type": "application/json" };
  const res = await withAuthRetry(async (token) => {
    // Rebuild headers per attempt — the Bearer overrides with the FRESH token on retry.
    const headers = { ...baseHeaders };
    if (token) { headers["Authorization"] = `Bearer ${token}`; }
    return fetch(`${core.getBackendUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }, auth);
  const json = res.ok ? await res.json() : undefined;
  return { res, json };
}

/** Check whether a rule is already cached in the backend. */
export async function checkBackendCache(core: PegaHttpCore, body: Record<string, unknown>, auth?: IngestAuthProvider): Promise<any> {
  const { res, json } = await postBackend(core, "/api/v1/pega/check-rule", body, auth);
  if (!res.ok) { return { cached: false }; }
  return json.data || { cached: false };
}

/** Ingest a rule into the backend KB. */
export async function ingestBackendRule(core: PegaHttpCore, body: Record<string, unknown>, auth?: IngestAuthProvider): Promise<any> {
  const { res, json } = await postBackend(core, "/api/v1/pega/ingest-rule", body, auth);
  if (!res.ok) { throw new Error(`Backend ingest failed: ${res.statusText}`); }
  return json.data || {};
}

/** Plan a crawl batch: which rule keys are missing vs cached. */
export async function crawlPlan(
  core: PegaHttpCore,
  body: { projectId: string; ruleKeys: string[]; visitedKeys: string[]; ruleChecksums?: Record<string, string> },
  auth?: IngestAuthProvider,
): Promise<{ missing: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }>; cached: string[] }> {
  const { res, json } = await postBackend(core, "/api/v1/pega/crawl-plan", body, auth);
  if (!res.ok) { throw new Error(`Crawl plan failed: ${res.statusText}`); }
  return json.data || { missing: [], cached: [] };
}

/** Submit a crawl batch of fetched rules to the backend. */
export async function crawlBatch(
  core: PegaHttpCore,
  body: { projectId: string; rules: Record<string, unknown>[]; visitedKeys: string[]; rulesChecksums?: Record<string, string>; rulesVersions?: Record<string, string> },
  auth?: IngestAuthProvider,
): Promise<{ stored: number; totalRulesInDb?: number; totalKbEntriesInDb?: number; totalGraphNodesInDb?: number; nextBatch: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }> }> {
  const { res, json } = await postBackend(core, "/api/v1/pega/crawl-batch", body, auth);
  if (!res.ok) { throw new Error(`Crawl batch failed: ${res.statusText}`); }
  return json.data || { stored: 0, nextBatch: [] };
}

/** Ask the backend whether a workspace looks like a Pega project. */
export async function detectProject(
  core: PegaHttpCore, workspaceRoot: string, auth?: IngestAuthProvider,
): Promise<{ isPegaProject: boolean; applicationName?: string; rulesetName?: string; confidence: number; indicators: string[] }> {
  const { res, json } = await postBackend(core, "/api/v1/pega/detect-project", { workspaceRoot }, auth);
  if (!res.ok) { throw new Error(`Detect project failed: ${res.statusText}`); }
  return json.data || { isPegaProject: false, confidence: 0, indicators: [] };
}
