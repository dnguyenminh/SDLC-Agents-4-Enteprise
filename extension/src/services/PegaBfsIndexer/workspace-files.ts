/**
 * Workspace-file helpers for the BFS indexer: app-name lookup and rule file
 * path mirroring (must stay in sync with PegaCrawlHelper).
 */

import * as path from "path";
import * as fs from "fs";

/**
 * SA4E-338 B1: Read the Pega application name from `<root>/pega-project.json`
 * (`applicationName`) — the authoritative source the extension writes during
 * "Fetch Pega Context". Returns undefined when the file is absent/unreadable, so
 * the backend falls back to the rule's `pyApplication` then projectId.
 * @param root - Workspace root of the Pega project.
 */
export function readPegaAppName(root: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(root, "pega-project.json"), "utf-8");
    const json = JSON.parse(raw) as { applicationName?: unknown };
    const name = typeof json.applicationName === "string" ? json.applicationName.trim() : "";
    return name || undefined;
  } catch {
    return undefined; // missing/unreadable → backend fallback
  }
}

/**
 * Mirror of saveRuleFile's path rule so a failed ingest can be retried from the
 * exact file the rule was written to (must stay in sync with PegaCrawlHelper).
 */
export function ruleFilePath(
  root: string,
  rObj: Record<string, unknown>,
  fallbackClass?: string,
  fallbackName?: string,
): string {
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
  return path.join(root, "rules", safeClass, `${safeName}.pega.json`);
}
