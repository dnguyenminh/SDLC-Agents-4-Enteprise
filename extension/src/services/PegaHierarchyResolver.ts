/**
 * PegaHierarchyResolver — Deterministic 5-step Pega hierarchy resolution.
 * Operator -> Access Group -> Application -> Dependencies -> Merged RuleSets.
 * All fetched rules are saved to disk as .pega.json files.
 */
import type { PegaHttpClient } from "./PegaHttpClient";
import {
  type LogFn,
  type HierarchyResult,
  saveHierarchyRule,
} from "./PegaHierarchyHelpers";
import { resolveApplicationHierarchy } from "./PegaAppDependencyResolver";

// Re-export HierarchyResult for consumers
export type { HierarchyResult, AccessGroupEntry } from "./PegaHierarchyHelpers";

/**
 * Resolve the full Pega hierarchy deterministically.
 * Steps: Operator -> Access Group -> Application -> Dependencies -> Merge.
 */
export async function resolvePegaHierarchy(
  client: PegaHttpClient,
  operatorId: string,
  workspaceRoot: string,
  log: LogFn,
): Promise<HierarchyResult> {
  const seeds = new Set<string>();
  let accessGroup = "";
  let appName = "";
  let appVersion = "";

  // Step 1: Operator ID
  const opResult = await resolveOperator(client, operatorId, workspaceRoot, log);
  seeds.add(opResult.insKey);
  accessGroup = opResult.accessGroup;

  // Step 2: Access Group
  if (accessGroup) {
    const agResult = await resolveAccessGroup(client, accessGroup, workspaceRoot, log);
    seeds.add(agResult.insKey);
    appName = agResult.appName;
    appVersion = agResult.appVersion;
  }

  // Steps 3-5: Application + Dependencies + Merge
  const appResult = await resolveApplicationHierarchy(
    client, appName, appVersion, workspaceRoot, log, seeds,
  );

  if (!appName) {
    throw new Error(
      `Cannot resolve Pega Application for operator "${operatorId}" ` +
      `(accessGroup="${accessGroup || "<empty>"}"). Verify credentials/permissions for the CodeIntelligence service.`
    );
  }
  return {
    seeds: Array.from(seeds),
    operatorId,
    accessGroup,
    appName,
    appVersion,
    ruleSets: appResult.mergedRuleSets,
    dependedApps: appResult.dependedAppNames,
    accessGroups: appResult.accessGroups,
  };
}

/** Step 1: Resolve operator and extract access group */
async function resolveOperator(
  client: PegaHttpClient, opId: string, root: string, log: LogFn,
): Promise<{ insKey: string; accessGroup: string }> {
  const insKey = `DATA-ADMIN-OPERATOR-ID ${opId.toUpperCase()}`;
  log(`[PegaHierarchy] Step 1: Resolving Operator "${opId}"...`);
  try {
    const obj = await client.getRuleByInsKey(insKey);
    saveHierarchyRule(obj, root, log, "DATA-ADMIN-OPERATOR-ID", opId);
    const ag = (obj.pyAccessGroup as string) || (obj.pyDefaultAccessGroup as string) || "";
    log(`[PegaHierarchy] Step 1 OK: Access Group = "${ag}"`);
    return { insKey, accessGroup: ag };
  } catch (err: any) {
    if (isAuthError(err)) {                                   // fail loud for auth errors
      log(`[PegaHierarchy] Step 1 FAIL (auth): ${err.message}`);
      throw new Error(`Pega authentication failed while resolving operator "${opId}": ${err.message}`);
    }
    log(`[PegaHierarchy] Step 1 WARN: Could not fetch Operator: ${err.message}`);
    return { insKey, accessGroup: "" };
  }
}

/** True when a Pega error represents an authentication/authorization failure. */
function isAuthError(err: { message?: string }): boolean {
  const m = (err?.message || "").toLowerCase();
  return m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("forbidden");
}

/** Step 2: Resolve access group and extract app name/version */
async function resolveAccessGroup(
  client: PegaHttpClient, ag: string, root: string, log: LogFn,
): Promise<{ insKey: string; appName: string; appVersion: string }> {
  const insKey = `DATA-ADMIN-OPERATOR-ACCESSGROUP ${ag}`;
  log(`[PegaHierarchy] Step 2: Resolving Access Group "${ag}"...`);
  try {
    const obj = await client.getRuleByInsKey(insKey);
    saveHierarchyRule(obj, root, log, "DATA-ADMIN-OPERATOR-ACCESSGROUP", ag);
    const name = (obj.pyDefaultAppName as string)
      || (obj.pyApplication as string)
      || (obj.pyAppName as string) || "";
    const ver = (obj.pyDefaultAppVersion as string)
      || (obj.pyApplicationVersion as string)
      || (obj.pyAppVersion as string) || "";
    log(`[PegaHierarchy] Step 2 OK: App="${name}", Version="${ver}"`);
    return { insKey, appName: name || ag.split(":")[0] || "", appVersion: ver };
  } catch (err: any) {
    log(`[PegaHierarchy] Step 2 WARN: Could not fetch Access Group: ${err.message}`);
    return { insKey, appName: ag.includes(":") ? ag.split(":")[0] : "", appVersion: "" };
  }
}

