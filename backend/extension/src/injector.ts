/**
 * Core injection logic --- copies resources to target workspace.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Component, CORE_COMPONENTS } from "./config";
import { detectModifiedFiles, loadBundledManifest, buildManifestAfterInject, getFileStatuses, migrateLegacyVersion, FileStatus } from "./checksum";
import { injectMcpConfig, migrateLegacyScripts, hasMcpConfig } from "./mcp-injector";
import { forceUpdate, updateSkipModified, updateWithBackup, injectComponent, promptUpdateWithDetails } from "./injector-helpers";

export { migrateLegacyScripts, injectMcpConfig } from "./mcp-injector";

export async function injectAll(root: string, extensionPath: string): Promise<string[]> {
  migrateLegacyVersion(root, extensionPath);
  const injected: string[] = [];
  for (const component of CORE_COMPONENTS) {
    if (injectComponent(component, root, extensionPath)) { injected.push(component.id); }
  }
  const variantId = await injectMcpConfig(root);
  if (variantId) { injected.push(`mcp-${variantId}`); }
  buildManifestAfterInject(root, extensionPath);
  return injected;
}

export async function injectSelective(root: string, extensionPath: string): Promise<string[]> {
  migrateLegacyVersion(root, extensionPath);
  const selected = await showComponentPicker();
  if (!selected || selected.length === 0) { return []; }
  const injected: string[] = [];
  for (const pick of selected) {
    if (pick.id === "mcp-config") {
      const variantId = await injectMcpConfig(root);
      if (variantId) { injected.push(`mcp-${variantId}`); }
    } else {
      const component = CORE_COMPONENTS.find(c => c.id === pick.id);
      if (component && injectComponent(component, root, extensionPath)) { injected.push(component.id); }
    }
  }
  buildManifestAfterInject(root, extensionPath);
  return injected;
}

export async function safeUpdate(root: string, extensionPath: string): Promise<string[]> {
  migrateLegacyVersion(root, extensionPath);
  const modified = detectModifiedFiles(root, extensionPath);
  if (modified.length === 0) { vscode.window.showInformationMessage("All files match bundled version. No update needed."); return []; }
  const statuses = getFileStatuses(root, extensionPath);
  const outdated = statuses.filter(s => s.state === "outdated");
  const userModified = statuses.filter(s => s.state === "modified");
  if (outdated.length > 0 && userModified.length === 0) { return forceUpdate(root, extensionPath); }
  const action = await promptUpdateWithDetails(outdated, userModified);
  if (action === "overwrite") { return forceUpdate(root, extensionPath); }
  if (action === "skip") { return updateSkipModified(root, extensionPath, userModified); }
  if (action === "backup") { return updateWithBackup(root, extensionPath, userModified); }
  return [];
}

export function checkStatus(workspaceRoot: string): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const c of CORE_COMPONENTS) { status[c.id] = fs.existsSync(path.join(workspaceRoot, c.targetPath)); }
  status["mcp-config"] = hasMcpConfig(workspaceRoot);
  return status;
}

export function getVersionReport(root: string, extensionPath: string): string {
  migrateLegacyVersion(root, extensionPath);
  const statuses = getFileStatuses(root, extensionPath);
  const bundled = loadBundledManifest(extensionPath);
  const bundledVersion = bundled?.version || "unknown";
  const outdated = statuses.filter(s => s.state === "outdated");
  const modified = statuses.filter(s => s.state === "modified");
  const missing = statuses.filter(s => s.state === "missing");
  const current = statuses.filter(s => s.state === "current");
  const lines: string[] = [`Extension version: ${bundledVersion}`, `Files: ${current.length} current, ${outdated.length} outdated, ${modified.length} modified, ${missing.length} missing`];
  if (outdated.length > 0) { lines.push("\nOutdated (need update):"); for (const f of outdated.slice(0, 15)) { lines.push(`  ${f.relativePath}  [v${f.workspaceVersion} -> v${f.bundledVersion}]`); } if (outdated.length > 15) { lines.push(`  ...and ${outdated.length - 15} more`); } }
  if (modified.length > 0) { lines.push("\nModified by user:"); for (const f of modified.slice(0, 10)) { lines.push(`  ${f.relativePath}  [v${f.workspaceVersion}]`); } if (modified.length > 10) { lines.push(`  ...and ${modified.length - 10} more`); } }
  return lines.join("\n");
}

async function showComponentPicker() {
  const corePicks = CORE_COMPONENTS.map(c => ({ label: c.label, description: c.description, id: c.id, picked: true }));
  const mcpPick = { label: "Code Intelligence MCP Server", description: "MCP server config", id: "mcp-config", picked: true };
  return vscode.window.showQuickPick([...corePicks, mcpPick], { canPickMany: true, placeHolder: "Select components to inject" });
}
