/**
 * PegaContextClient — Pega operator/application context + project persistence
 * (SA4E-323 refactor, extracted from PegaHttpClient). Free functions taking a
 * PegaHttpCore. Behavior-preserving.
 */

import * as vscode from "vscode";
import { createHash } from "crypto";
import { setProjectId } from "../../extension";
import { resolvePegaHierarchy, type HierarchyResult } from "../PegaHierarchyResolver";
import type { PegaHttpCore, PegaOperatorContext } from "./PegaHttpCore";

/** Resolve the current operator context, probing OperatorID then casetypes. */
export async function getOperatorContext(core: PegaHttpCore): Promise<PegaOperatorContext> {
  const base = core.getPegaEndpoint();
  const headers = { Authorization: await core.getAuthHeader() };
  const username = core.getConfiguredUsername();
  const ctx = await probeOperatorId(core, base, headers, username);
  if (ctx) { return ctx; }
  const fallback = await probeCaseTypes(base, headers, username);
  if (fallback) { return fallback; }
  throw new Error("Failed to connect to Pega Server");
}

/** Probe D_OperatorID endpoints; sets activePrefix on success. */
async function probeOperatorId(
  core: PegaHttpCore, base: string, headers: Record<string, string>, username: string,
): Promise<PegaOperatorContext | null> {
  for (const url of [`${base}/api/v1/data/D_OperatorID`, `${base}/PRRestService/api/v1/data/D_OperatorID`]) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        const activeAccessGroup = data.pyAccessGroup || "";
        const appName = activeAccessGroup ? activeAccessGroup.split(":")[0] : "PegaApp";
        core.activePrefix = url.includes("/PRRestService/")
          ? `${base}/PRRestService/CodeIntelligence/v1` : `${base}/api/CodeIntelligence/v1`;
        return {
          operatorId: data.pyUserIdentifier || username, activeAccessGroup,
          currentApplication: { name: appName, version: "v1", pzInsKey: `RULE-APPLICATION ${appName.toUpperCase()}` },
          rulesetStack: [],
        };
      }
      if (res.status === 401) { throw new Error("HTTP 401 Unauthorized (Invalid Operator ID or Password)"); }
      if (res.status === 403) { throw new Error("HTTP 403 Forbidden (Operator does not have access)"); }
    } catch (err: any) {
      if (err.message.includes("401") || err.message.includes("403")) { throw err; }
    }
  }
  return null;
}

/** Fallback probe via casetypes to derive an application name. */
async function probeCaseTypes(
  base: string, headers: Record<string, string>, username: string,
): Promise<PegaOperatorContext | null> {
  for (const url of [`${base}/api/v1/casetypes`, `${base}/PRRestService/api/v1/casetypes`]) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        const appName = data.caseTypes?.[0]?.name || "Pega App";
        return {
          operatorId: username, activeAccessGroup: "",
          currentApplication: { name: appName, version: "v1", pzInsKey: `RULE-APPLICATION ${appName.toUpperCase()}` },
          rulesetStack: [],
        };
      }
    } catch (err) { console.debug("[PegaHttpClient] skip :", (err as Error).message); }
  }
  return null;
}

/** Deterministic 5-step hierarchy resolution (delegates to PegaHierarchyResolver). */
export async function resolveDeterministicPegaHierarchy(
  core: PegaHttpCore, ruleFetcher: unknown, operatorIdHint?: string,
): Promise<HierarchyResult> {
  const opId = (operatorIdHint || core.getConfiguredUsername()).trim();
  if (!opId) {
    throw new Error("Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing.");
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  const root = folder ? folder.uri.fsPath : process.cwd();
  return resolvePegaHierarchy(ruleFetcher as any, opId, root, core.log.bind(core));
}

/** Fetch case types (non-fatal; returns [] on failure). */
export async function fetchCaseTypes(core: PegaHttpCore): Promise<Array<{ name: string; caseTypeID: string }>> {
  const base = core.getPegaEndpoint();
  const headers = { Authorization: await core.getAuthHeader() };
  for (const ep of [`${base}/api/v1/casetypes`, `${base}/PRRestService/api/v1/casetypes`]) {
    try {
      const res = await fetch(ep, { headers });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.caseTypes)) {
          return data.caseTypes.map((c: any) => ({ name: c.name || "", caseTypeID: c.caseTypeID || "" }));
        }
      }
    } catch (err) { console.debug("[PegaHttpClient] non-fatal :", (err as Error).message); }
  }
  return [];
}

/** Resolve the full hierarchy, persist pega-project.json + project id, return summary. */
export async function fetchAndSavePegaContext(
  core: PegaHttpCore, ruleFetcher: unknown, workspaceRoot: string,
): Promise<{ applicationName: string; accessGroup: string; caseTypesCount: number; filePath: string }> {
  const username = core.getConfiguredUsername();
  core.log("[PegaHttpClient] 🔍 fetchAndSavePegaContext: Starting hierarchy resolution...");
  const result = await resolveDeterministicPegaHierarchy(core, ruleFetcher, username);
  const caseTypes = await fetchCaseTypes(core);
  const appInsKey = result.appVersion
    ? `RULE-APPLICATION ${result.appName.toUpperCase()} ${result.appVersion}`
    : `RULE-APPLICATION ${result.appName.toUpperCase()}`;
  const projectData = {
    isPegaProject: true, pegaEndpoint: core.getPegaEndpoint(), operatorId: result.operatorId,
    accessGroup: result.accessGroup, applicationName: result.appName, applicationVersion: result.appVersion,
    applicationInsKey: appInsKey, pzInsKey: appInsKey, ruleSets: result.ruleSets,
    dependedApps: result.dependedApps, accessGroups: result.accessGroups, caseTypes,
    fetchedAt: new Date().toISOString(),
  };
  const jsonPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), "pega-project.json");
  await vscode.workspace.fs.writeFile(jsonPath, Buffer.from(JSON.stringify(projectData, null, 2), "utf-8"));
  await persistProjectId(workspaceRoot, result.appName);
  core.log(`[PegaHttpClient] ✅ fetchAndSavePegaContext complete: app="${result.appName}" v${result.appVersion}, ${caseTypes.length} caseTypes`);
  return { applicationName: result.appName, accessGroup: result.accessGroup, caseTypesCount: caseTypes.length, filePath: jsonPath.fsPath };
}

/** Derive + persist the project id from the Pega application name. */
async function persistProjectId(workspaceRoot: string, appName: string): Promise<void> {
  const codeIntelDir = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ".code-intel");
  await vscode.workspace.fs.createDirectory(codeIntelDir);
  const pjPath = vscode.Uri.joinPath(codeIntelDir, "project.json");
  const projectId = createHash("sha256").update("pega:" + appName).digest("hex").slice(0, 12);
  await vscode.workspace.fs.writeFile(pjPath, Buffer.from(JSON.stringify({ projectId }, null, 2), "utf-8"));
  setProjectId(projectId);
}
