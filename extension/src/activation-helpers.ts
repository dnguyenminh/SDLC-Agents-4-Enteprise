import * as vscode from "vscode";
import { isUpgradeAvailable, loadBundledManifest, migrateLegacyVersion } from "./checksum";
import { migrateLegacyScripts, checkStatus } from "./injector";
import { McpServerManager } from "./mcp-server-manager";

export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

export function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "kiroSdlc.status";
  item.show();
  return item;
}

export function updateStatusBar(item: vscode.StatusBarItem, mcpManager?: McpServerManager): void {
  const root = getWorkspaceRoot();
  if (!root) { item.text = "$(circle-slash) SDLC"; item.tooltip = "No workspace open"; return; }
  const status = checkStatus(root);
  const allPresent = Object.values(status).every(v => v);
  const serverIcon = mcpManager?.status === "running" ? "$(check)" : "$(warning)";
  item.text = allPresent ? `${serverIcon} SDLC Agents` : `$(warning) SDLC Agents`;
  const portInfo = mcpManager?.port ? ` | Port: ${mcpManager.port}` : "";
  item.tooltip = allPresent ? `All components active | MCP: ${mcpManager?.status || "N/A"}${portInfo}` : "Some components missing";
}

export async function checkForUpgrade(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  migrateLegacyVersion(root, context.extensionPath);
  migrateLegacyScripts(root);
  if (!isUpgradeAvailable(root, context.extensionPath)) { return; }
  const manifest = loadBundledManifest(context.extensionPath);
  const action = await vscode.window.showInformationMessage(`🆕 SDLC update → v${manifest?.version || "?"}`, "Update Now", "Later");
  if (action === "Update Now") { vscode.commands.executeCommand("kiroSdlc.update"); }
}
