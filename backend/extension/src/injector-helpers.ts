/**
 * Injector update helpers --- backup, skip-modified, force-update strategies.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Component, CORE_COMPONENTS } from "./config";
import { buildManifestAfterInject, getFileStatuses, FileStatus } from "./checksum";
import { copyDirRecursive, copyDirFiltered, copySelectedItems } from "./file-utils";

export function forceUpdate(root: string, extensionPath: string): string[] {
  const injected: string[] = [];
  for (const component of CORE_COMPONENTS) {
    if (injectComponent(component, root, extensionPath)) { injected.push(component.id); }
  }
  buildManifestAfterInject(root, extensionPath);
  return injected;
}

export function updateSkipModified(root: string, extensionPath: string, userModified: FileStatus[]): string[] {
  const skipPaths = new Set(userModified.map(m => m.relativePath));
  const injected: string[] = [];
  for (const component of CORE_COMPONENTS) {
    if (injectComponentFiltered(component, root, extensionPath, skipPaths)) { injected.push(component.id); }
  }
  buildManifestAfterInject(root, extensionPath);
  return injected;
}

export function updateWithBackup(root: string, extensionPath: string, userModified: FileStatus[]): string[] {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(root, ".kiro/.sdlc-backup", timestamp);
  for (const file of userModified) {
    const src = path.join(root, file.relativePath);
    const dest = path.join(backupDir, file.relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(src)) { fs.copyFileSync(src, dest); }
  }
  vscode.window.showInformationMessage(`Backed up ${userModified.length} files to .kiro/.sdlc-backup/${timestamp}`);
  return forceUpdate(root, extensionPath);
}

export function injectComponent(component: Component, root: string, extensionPath: string): boolean {
  const source = path.join(extensionPath, "resources", component.sourcePath);
  const target = path.join(root, component.targetPath);
  if (!fs.existsSync(source)) { vscode.window.showWarningMessage(`Source not found: ${component.sourcePath}`); return false; }
  try {
    if (component.filter) { copySelectedItems(source, target, component.filter); }
    else { copyDirRecursive(source, target); }
    return true;
  } catch (err) { vscode.window.showErrorMessage(`Failed to inject ${component.id}: ${err}`); return false; }
}

export function injectComponentFiltered(component: Component, root: string, extensionPath: string, skipPaths: Set<string>): boolean {
  const source = path.join(extensionPath, "resources", component.sourcePath);
  const target = path.join(root, component.targetPath);
  if (!fs.existsSync(source)) { return false; }
  try { copyDirFiltered({ source, target, workspaceRoot: root, skipPaths }); return true; }
  catch (err) { vscode.window.showErrorMessage(`Failed to inject ${component.id}: ${err}`); return false; }
}

export async function promptUpdateWithDetails(outdated: FileStatus[], userModified: FileStatus[]): Promise<string> {
  const lines: string[] = [];
  if (outdated.length > 0) { lines.push(`Up ${outdated.length} file(s) outdated`); outdated.slice(0, 5).forEach(f => lines.push(`  - ${f.relativePath}`)); }
  if (userModified.length > 0) { lines.push(`${userModified.length} file(s) modified by you`); userModified.slice(0, 5).forEach(f => lines.push(`  - ${f.relativePath}`)); }
  const action = await vscode.window.showWarningMessage(lines.join("\n"), { modal: true }, "Overwrite All", "Skip Modified", "Backup & Overwrite", "Cancel");
  if (action === "Overwrite All") return "overwrite";
  if (action === "Skip Modified") return "skip";
  if (action === "Backup & Overwrite") return "backup";
  return "cancel";
}
