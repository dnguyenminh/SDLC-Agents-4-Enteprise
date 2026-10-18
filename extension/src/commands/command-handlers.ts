/**
 * command-handlers — implementation of the non-LLM VS Code command handlers.
 * Extracted from CommandRegistrar (BR-18); registerCommands stays there and
 * imports these handlers. Behavior unchanged.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  injectAll, injectSelective, safeUpdate, checkStatus,
  getVersionReport
} from "../injector";
import { promptIndexAfterInject } from "../indexer";
import { IServerManager } from "../types/server-types";
import { WebviewPanelManager } from "../webview-panel-manager";
import { removeBundledMcpConfig } from "../mcp-injector";
import { LoginPanel } from "../panels/login-panel";
import { AuthManager } from "../auth/AuthManager";
import { KiroTreeViewProvider } from "../sidebar/tree-view-provider";
import { showUserError } from "../utils/panel-utils";
import { writeJsonFile } from "../utils/mcp-config-file";

export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

export async function handleLogin(context: vscode.ExtensionContext, authManager?: AuthManager, treeProvider?: KiroTreeViewProvider): Promise<void> {
  if (!authManager) { vscode.window.showErrorMessage("Auth manager not initialized."); return; }
  new LoginPanel(authManager, context.extensionUri).show();
  authManager.onStateChange((state) => {
    if (state === "AUTHENTICATED") {
      // Show the REAL signed-in user (password or SSO), not a hardcoded "admin".
      treeProvider?.setAuthenticated(true, "");
      authManager?.fetchCurrentUsername().then((name) => {
        if (authManager?.isAuthenticated) { treeProvider?.setAuthenticated(true, name); }
      });
    } else if (state === "UNAUTHENTICATED") { treeProvider?.setAuthenticated(false); }
  });
}

export async function handleLoginEntra(authManager?: AuthManager): Promise<void> {
  if (!authManager) { vscode.window.showErrorMessage("Auth manager not initialized."); return; }
  try {
    await authManager.loginEntra();
    vscode.window.showInformationMessage("✅ Signed in with Microsoft Entra ID");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Entra login failed: ${err.message}`);
  }
}

export async function handleLogout(authManager?: AuthManager, panelManager?: WebviewPanelManager): Promise<void> {
  if (!authManager) { return; }
  await authManager.logout();
  panelManager?.disposeAll();
  vscode.window.showInformationMessage("Logged out successfully.");
}

export async function handleInjectAll(context: vscode.ExtensionContext, mcpManager?: IServerManager): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const confirm = await vscode.window.showInformationMessage("Inject all SDLC agents?", "Yes", "Cancel");
  if (confirm !== "Yes") { return; }
  try {
    const port = mcpManager?.port || 9181;
    const injected = await injectAll(root, context.extensionPath, port);
    vscode.window.showInformationMessage(`✅ Injected ${injected.length} components`);
    await promptIndexAfterInject(root);
  } catch (err) { showUserError("Inject", err); }
}

export async function handleInjectSelective(context: vscode.ExtensionContext, mcpManager?: IServerManager): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const port = mcpManager?.port || 9181;
  const injected = await injectSelective(root, context.extensionPath, port);
  if (injected.length > 0) { vscode.window.showInformationMessage(`✅ Injected: ${injected.join(", ")}`); await promptIndexAfterInject(root); }
}

export async function handleUpdate(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const injected = await safeUpdate(root, context.extensionPath);
  if (injected.length > 0) { vscode.window.showInformationMessage(`✅ Updated ${injected.length} components`); }
}

export async function handleStatus(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const status = checkStatus(root);
  const lines = Object.entries(status).map(([id, exists]) => `${exists ? "✅" : "❌"} ${id}`);
  const action = await vscode.window.showInformationMessage(`SDLC Status:\n${lines.join("\n")}`, "Show File Versions", "Inject Missing", "Close");
  if (action === "Show File Versions") {
    const ch = vscode.window.createOutputChannel("SDLC File Versions"); ch.show();
    ch.appendLine(getVersionReport(root, context.extensionPath));
  } else if (action === "Inject Missing") { vscode.commands.executeCommand("sdlcAgents.injectSelective"); }
}

export async function handleOpenKbBrowser(mcpManager?: IServerManager): Promise<void> {
  if (!mcpManager || mcpManager.status !== "running") { vscode.window.showErrorMessage("MCP server not running."); return; }
  await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${mcpManager.port}/`));
}

export async function handleRestartServer(mcpManager?: IServerManager): Promise<void> {
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

export async function handleStopServer(mcpManager?: IServerManager, workspaceRoot?: string): Promise<void> {
  if (!mcpManager) { vscode.window.showErrorMessage("No workspace open."); return; }
  try {
    await mcpManager.kill();
    if (workspaceRoot) { removeBundledMcpConfig(workspaceRoot); }
    vscode.window.showInformationMessage("MCP server disconnected.");
  }
  catch (err) { vscode.window.showErrorMessage(`Disconnect failed: ${(err as Error).message}`); }
}

export async function handleEditConfig(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const config = vscode.workspace.getConfiguration("sdlcAgents");
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

export async function handleChangeConfig(mcpManager?: IServerManager): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  const currentRelPath = config.get<string>("configPath", ".code-intel/orchestration.json");
  const defaultUri = vscode.Uri.file(root);
  const result = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri, filters: { "JSON": ["json"] } });
  if (!result || result.length === 0) { return; }
  const relPath = path.relative(root, result[0].fsPath).replace(/\\/g, "/");
  await config.update("configPath", relPath, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`Config changed to: ${relPath}. Restarting...`);
  await handleRestartServer(mcpManager);
}
