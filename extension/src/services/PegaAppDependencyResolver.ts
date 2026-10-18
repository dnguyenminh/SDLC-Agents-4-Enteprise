/**
 * PegaAppDependencyResolver — Steps 3-5 of the Pega hierarchy resolution.
 * Fetches the main application rule, resolves depended applications
 * recursively (depth-first, max depth capped by MAX_RECURSION_DEPTH),
 * and merges all ruleset layers. Extracted from PegaHierarchyResolver (BR-18).
 */
import type { PegaHttpClient } from "./PegaHttpClient";
import {
  type LogFn,
  type RuleSetEntry,
  type DependedAppRef,
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

/** Steps 3-5: Fetch main app, resolve dependencies recursively, merge rulesets */
export async function resolveApplicationHierarchy(
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
