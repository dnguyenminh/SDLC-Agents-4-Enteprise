/**
 * PegaHierarchyResolver — Deterministic 5-step Pega hierarchy resolution.
 * Operator -> Access Group -> Application -> Dependencies -> Merged RuleSets.
 * All fetched rules are saved to disk as .pega.json files.
 */
import type { PegaHttpClient } from "./PegaHttpClient";
import {
  type LogFn,
  type RuleSetEntry,
  type DependedAppRef,
  type HierarchyResult,
  type AccessGroupEntry,
  MAX_RECURSION_DEPTH,
  saveHierarchyRule,
  extractRuleSetList,
  extractProdRuleSetList,
  extractDependedApps,
  mergeRuleSetLayers,
  buildAppInsKeys,
} from "./PegaHierarchyHelpers";
import { fetchAccessGroupsForApp } from "./PegaAccessGroupFetcher";

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

/** Steps 3-5: Fetch main app, resolve dependencies recursively, merge rulesets */
async function resolveApplicationHierarchy(
  client: PegaHttpClient,
  appName: string,
  appVersion: string,
  root: string,
  log: LogFn,
  seeds: Set<string>,
): Promise<{ mergedRuleSets: string[]; dependedAppNames: string[]; accessGroups: AccessGroupEntry[] }> {
  if (!appName) {
    return { mergedRuleSets: [], dependedAppNames: [], accessGroups: [] };
  }

  const mainApp = await fetchApplicationRule(client, appName, appVersion, root, log, seeds);
  if (!mainApp) {
    return { mergedRuleSets: [], dependedAppNames: [], accessGroups: [] };
  }

  const mainRuleSets = extractRuleSetList(mainApp);
  const prodRuleSets = extractProdRuleSetList(mainApp);
  const dependedRefs = extractDependedApps(mainApp);
  log(`[PegaHierarchy] Step 3 OK: ${mainRuleSets.length} rulesets, ${prodRuleSets.length} prod, ${dependedRefs.length} deps`);

  // Step 3a: Extract case type FQN class names from pyWorkMetaData (page list in App Rule)
  const workMetaData = (mainApp as any).pyWorkMetaData;
  if (Array.isArray(workMetaData)) {
    for (const wm of workMetaData) {
      const fqnClass = wm.pyWorkTypeImplementationClassName as string | undefined;
      if (fqnClass && fqnClass.includes("-")) {
        // Add class rule seed
        seeds.add(`RULE-OBJ-CLASS ${fqnClass}`);
        // Add case type rule seed (insKey = RULE-OBJ-CASETYPE {CLASS-UPPER} PYDEFAULT)
        seeds.add(`RULE-OBJ-CASETYPE ${fqnClass.toUpperCase()} PYDEFAULT`);
        log(`[PegaHierarchy] 📌 Case Type: "${wm.pyWorkTypeName || ''}" → class: ${fqnClass} + caseType: RULE-OBJ-CASETYPE ${fqnClass.toUpperCase()} PYDEFAULT`);
      }
    }
  }

  // Step 3b: Discover access groups for this application (non-fatal)
  const accessGroups = await fetchAccessGroupsForApp(client, appName, appVersion, log);
  log(`[PegaHierarchy] Found ${accessGroups.length} access groups for app`);

  // Step 4: Resolve depended applications recursively
  const depLayers: RuleSetEntry[][] = [];
  const dependedAppNames: string[] = [];
  const visited = new Set<string>([appName.toUpperCase()]);

  await resolveDepthFirst(client, dependedRefs, root, log, seeds, depLayers, dependedAppNames, visited, 0);

  // Step 5: Merge - main app on top, deps below, prod at end
  const allLayers = [mainRuleSets, ...depLayers, prodRuleSets];
  const mergedRuleSets = mergeRuleSetLayers(allLayers);
  log(`[PegaHierarchy] Step 5 OK: Merged ${mergedRuleSets.length} unique rulesets`);

  return { mergedRuleSets, dependedAppNames, accessGroups };
}

/** Fetch a RULE-APPLICATION by name+version, trying multiple key patterns */
async function fetchApplicationRule(
  client: PegaHttpClient, appName: string, appVersion: string,
  root: string, log: LogFn, seeds: Set<string>,
): Promise<Record<string, unknown> | null> {
  const validVer = appVersion && appVersion.toLowerCase() !== "auto" ? appVersion : null;
  const keysToTry = buildAppInsKeys(appName, validVer);

  for (const key of keysToTry) {
    try {
      log(`[PegaHierarchy] Fetching app rule "${key}"...`);
      const obj = await client.getRuleByInsKey(key);
      seeds.add(key);
      saveHierarchyRule(obj, root, log, "Rule-Application", appName);
      return obj;
    } catch {
      // try next key variation
    }
  }
  log(`[PegaHierarchy] WARN: Could not fetch Application rule for "${appName}"`);
  return null;
}

/** Recursively resolve depended applications (depth-first, max depth = 5) */
async function resolveDepthFirst(
  client: PegaHttpClient, refs: DependedAppRef[], root: string, log: LogFn,
  seeds: Set<string>, layers: RuleSetEntry[][], names: string[],
  visited: Set<string>, depth: number,
): Promise<void> {
  if (depth >= MAX_RECURSION_DEPTH || refs.length === 0) { return; }

  for (const ref of refs) {
    const key = ref.appName.toUpperCase();
    if (visited.has(key)) { continue; }
    visited.add(key);
    names.push(ref.appName);

    log(`[PegaHierarchy] Step 4 (depth ${depth + 1}): dep "${ref.appName}" v${ref.appVersion}`);
    const depApp = await fetchApplicationRule(client, ref.appName, ref.appVersion, root, log, seeds);
    if (!depApp) { continue; }

    layers.push(extractRuleSetList(depApp));
    const subDeps = extractDependedApps(depApp);
    await resolveDepthFirst(client, subDeps, root, log, seeds, layers, names, visited, depth + 1);
  }
}
