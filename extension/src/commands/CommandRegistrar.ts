/**
 * CommandRegistrar — registers all non-LLM VS Code commands.
 * Extracted from extension.ts for SRP.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  injectAll, injectSelective, safeUpdate, checkStatus,
  getVersionReport
} from "../injector";
import { promptIndexAfterInject, handleIndexWorkspace } from "../indexer";
import { McpServerManager } from "../mcp-server-manager";
import { IServerManager } from "../types/server-types";
import { WebviewPanelManager } from "../webview-panel-manager";
import { removeBundledMcpConfig } from "../mcp-injector";
import { registerSymbolSearch } from "../symbol-search";
import { registerDiagnosticsProvider } from "../diagnostics-provider";
import { registerAIContextCommands } from "../ai-context-commands";
import { SecurityPanel } from "../panels/security-panel";
import { showImpactAnalysis } from "../panels/impact-panel";
import { SettingsPanel } from "../panels/settings-panel";
import { LoginPanel } from "../panels/login-panel";
import { AuthManager } from "../auth/AuthManager";
import { KiroTreeViewProvider } from "../sidebar/tree-view-provider";
import { showUserError } from "../utils/panel-utils";
import { writeJsonFile } from "../utils/mcp-config-file";

interface CommandDeps {
  mcpManager?: IServerManager;
  panelManager?: WebviewPanelManager;
  authManager?: AuthManager;
  treeProvider?: KiroTreeViewProvider;
  workspaceRoot?: string;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { mcpManager, panelManager, authManager, treeProvider, workspaceRoot } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("kiroSdlc.injectAll", () => handleInjectAll(context)),
    vscode.commands.registerCommand("kiroSdlc.injectSelective", () => handleInjectSelective(context)),
    vscode.commands.registerCommand("kiroSdlc.update", () => handleUpdate(context)),
    vscode.commands.registerCommand("kiroSdlc.status", () => handleStatus(context)),
    vscode.commands.registerCommand("kiroSdlc.indexWorkspace", () => handleIndexWorkspace(authManager?.getTokenSync())),
    vscode.commands.registerCommand("kiroSdlc.login", () => handleLogin(context, authManager, treeProvider)),
    vscode.commands.registerCommand("kiroSdlc.logout", () => handleLogout(authManager, panelManager)),
    vscode.commands.registerCommand("kiroSdlc.openKbGraph", () => panelManager?.openPanel("graph")),
    vscode.commands.registerCommand("kiroSdlc.openKbDashboard", () => panelManager?.openPanel("dashboard")),
    vscode.commands.registerCommand("kiroSdlc.openKbTags", () => panelManager?.openPanel("tags")),
    vscode.commands.registerCommand("kiroSdlc.openKbQuality", () => panelManager?.openPanel("quality")),
    vscode.commands.registerCommand("kiroSdlc.openKbAnalytics", () => panelManager?.openPanel("analytics")),
    vscode.commands.registerCommand("kiroSdlc.openWorkflowGraph", () => panelManager?.openPanel("workflow")),
    vscode.commands.registerCommand("kiroSdlc.restartMcpServer", () => handleRestartServer(mcpManager)),
    vscode.commands.registerCommand("kiroSdlc.stopMcpServer", () => handleStopServer(mcpManager, workspaceRoot)),
    vscode.commands.registerCommand("kiroSdlc.openKbBrowser", () => handleOpenKbBrowser(mcpManager)),
    vscode.commands.registerCommand("kiroSdlc.editConfig", () => handleEditConfig()),
    vscode.commands.registerCommand("kiroSdlc.changeConfig", () => handleChangeConfig(mcpManager)),
    vscode.commands.registerCommand("kiroSdlc.openSettings", () => SettingsPanel.open(context.extensionUri, context.secrets)),
  );

  if (mcpManager) {
    registerSymbolSearch(context, mcpManager);
    registerDiagnosticsProvider(context, mcpManager);
    registerAIContextCommands(context, mcpManager);
    context.subscriptions.push(
      vscode.commands.registerCommand("kiroSdlc.openSecurityPanel", () => { new SecurityPanel(mcpManager, context.extensionUri).loadData(); }),
      vscode.commands.registerCommand("kiroSdlc.impactAnalysis", () => showImpactAnalysis(mcpManager, context.extensionUri)),
    );
  }
}

// === Handlers ===

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

async function handleLogin(context: vscode.ExtensionContext, authManager?: AuthManager, treeProvider?: KiroTreeViewProvider): Promise<void> {
  if (!authManager) { vscode.window.showErrorMessage("Auth manager not initialized."); return; }
  new LoginPanel(authManager, context.extensionUri).show();
  authManager.onStateChange((state) => {
    if (state === "AUTHENTICATED") { treeProvider?.setAuthenticated(true, "admin"); }
    else if (state === "UNAUTHENTICATED") { treeProvider?.setAuthenticated(false); }
  });
}

async function handleLogout(authManager?: AuthManager, panelManager?: WebviewPanelManager): Promise<void> {
  if (!authManager) { return; }
  await authManager.logout();
  panelManager?.disposeAll();
  vscode.window.showInformationMessage("Logged out successfully.");
}

async function handleInjectAll(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const confirm = await vscode.window.showInformationMessage("Inject all SDLC agents?", "Yes", "Cancel");
  if (confirm !== "Yes") { return; }
  try {
    const injected = await injectAll(root, context.extensionPath);
    vscode.window.showInformationMessage(`✅ Injected ${injected.length} components`);
    await promptIndexAfterInject(root);
  } catch (err) { showUserError("Inject", err); }
}

async function handleInjectSelective(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const injected = await injectSelective(root, context.extensionPath);
  if (injected.length > 0) { vscode.window.showInformationMessage(`✅ Injected: ${injected.join(", ")}`); await promptIndexAfterInject(root); }
}

async function handleUpdate(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const injected = await safeUpdate(root, context.extensionPath);
  if (injected.length > 0) { vscode.window.showInformationMessage(`✅ Updated ${injected.length} components`); }
}

async function handleStatus(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const status = checkStatus(root);
  const lines = Object.entries(status).map(([id, exists]) => `${exists ? "✅" : "❌"} ${id}`);
  const action = await vscode.window.showInformationMessage(`SDLC Status:\n${lines.join("\n")}`, "Show File Versions", "Inject Missing", "Close");
  if (action === "Show File Versions") {
    const ch = vscode.window.createOutputChannel("SDLC File Versions"); ch.show();
    ch.appendLine(getVersionReport(root, context.extensionPath));
  } else if (action === "Inject Missing") { vscode.commands.executeCommand("kiroSdlc.injectSelective"); }
}

async function handleOpenKbBrowser(mcpManager?: IServerManager): Promise<void> {
  if (!mcpManager || mcpManager.status !== "running") { vscode.window.showErrorMessage("MCP server not running."); return; }
  await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${mcpManager.port}/`));
}

async function handleRestartServer(mcpManager?: IServerManager): Promise<void> {
  if (!mcpManager) { vscode.window.showErrorMessage("No workspace open."); return; }
  try {
    if (mcpManager.reconnect) {
      await mcpManager.reconnect();
    } else {
      await mcpManager.restart();
    }
    vscode.window.showInformationMessage("MCP server reconnected.");
  }
  catch (err) { vscode.window.showErrorMessage(`Reconnect failed: ${(err as Error).message}`); }
}

async function handleStopServer(mcpManager?: IServerManager, workspaceRoot?: string): Promise<void> {
  if (!mcpManager) { vscode.window.showErrorMessage("No workspace open."); return; }
  try {
    await mcpManager.kill();
    if (workspaceRoot) { removeBundledMcpConfig(workspaceRoot); }
    vscode.window.showInformationMessage("MCP server disconnected.");
  }
  catch (err) { vscode.window.showErrorMessage(`Disconnect failed: ${(err as Error).message}`); }
}

async function handleEditConfig(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const relPath = config.get<string>("configPath", ".code-intel/orchestration.json");
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    const create = await vscode.window.showWarningMessage(`Config not found: ${relPath}. Create?`, "Create", "Cancel");
    if (create !== "Create") { return; }
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    writeJsonFile(fullPath, { servers: [], routing: {} });
  }
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fullPath));
}

async function handleChangeConfig(mcpManager?: IServerManager): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const currentRelPath = config.get<string>("configPath", ".code-intel/orchestration.json");
  const defaultUri = vscode.Uri.file(root);
  const result = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri, filters: { "JSON": ["json"] } });
  if (!result || result.length === 0) { return; }
  const relPath = path.relative(root, result[0].fsPath).replace(/\\/g, "/");
  await config.update("configPath", relPath, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`Config changed to: ${relPath}. Restarting...`);
  await handleRestartServer(mcpManager);
}


