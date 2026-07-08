/**
 * SDLC Agents 4 Enterprise — VS Code Extension entry point.
 * Thin activation shell — delegates command registration to CommandRegistrar and LlmCommands.
 */

import * as vscode from "vscode";
import { isUpgradeAvailable, loadBundledManifest, migrateLegacyVersion } from "./checksum";
import { migrateLegacyScripts, checkStatus } from "./injector";
import { McpServerManager } from "./mcp-server-manager";
import { WebviewPanelManager } from "./webview-panel-manager";
import { KiroTreeViewProvider } from "./sidebar/tree-view-provider";
import { writeBundledMcpConfig } from "./mcp-injector";
import { ConfigWatcher } from "./config-watcher";
import { KbEventBus } from "./kb-event-bus";
import { ChatPanelProvider } from "./chat-panel/chat-panel-provider";
import { BasePanel } from "./panels/base-panel";
import { AuthManager } from "./auth/AuthManager";
import { mapServerStatusToWebview } from "./types";
import { registerCommands } from "./commands/CommandRegistrar";
import { registerLlmCommands } from "./commands/LlmCommands";
import { initPlatformSwap } from "./platform-swap";

let mcpManager: McpServerManager | undefined;
let panelManager: WebviewPanelManager | undefined;
let configWatcher: ConfigWatcher | undefined;
let kbEventBus: KbEventBus | undefined;
let treeProvider: KiroTreeViewProvider | undefined;
let authManager: AuthManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    await initializeWorkspace(context, workspaceRoot, statusBar);
  }

  updateStatusBar(statusBar);
  checkForUpgrade(context);
}

export function deactivate() {
  configWatcher?.dispose();
  mcpManager?.kill().catch((err) => console.error("[Kiro] Deactivate kill failed:", (err as Error).message));
  panelManager?.disposeAll();
}

async function initializeWorkspace(context: vscode.ExtensionContext, workspaceRoot: string, statusBar: vscode.StatusBarItem): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Kiro MCP Server");
  context.subscriptions.push(outputChannel);

  const mcpConfig = vscode.workspace.getConfiguration("kiroSdlc");
  const backendUrl = mcpConfig.get<string>("backend.url") || "http://127.0.0.1:48721";

  authManager = new AuthManager(context.secrets, backendUrl);
  await authManager.initialize();

  mcpManager = new McpServerManager(workspaceRoot, outputChannel, authManager, backendUrl);
  context.subscriptions.push(mcpManager);

  kbEventBus = new KbEventBus(outputChannel, mcpManager);
  context.subscriptions.push(kbEventBus);

  panelManager = new WebviewPanelManager(mcpManager, context.extensionUri, kbEventBus);
  context.subscriptions.push(panelManager);

  BasePanel.authTokenProvider = () => authManager?.getTokenSync() || "";

  setupAuthStateHandlers();
  setupTreeView(context);

  const chatPanelProvider = new ChatPanelProvider(context.extensionUri, mcpManager, workspaceRoot, context.secrets, context.workspaceState);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("kiroChatPanel", chatPanelProvider, { webviewOptions: { retainContextWhenHidden: true } }),
    chatPanelProvider
  );

  registerLlmCommands(context, chatPanelProvider);
  registerCommands(context, { mcpManager, panelManager, authManager, treeProvider, workspaceRoot });

  setupConfigWatcher(context, workspaceRoot, outputChannel);
  setupMcpStatusBroadcast(statusBar, workspaceRoot);
  await autoSpawnServer(mcpConfig, outputChannel);

  // Initialize Platform Swap feature (IDE-aware agent config swap)
  await initPlatformSwap(context, workspaceRoot, outputChannel).catch((err) =>
    outputChannel.appendLine(`[PlatformSwap] Init failed: ${(err as Error).message}`)
  );
}

function setupAuthStateHandlers(): void {
  authManager?.onStateChange((state) => {
    if (state === "AUTHENTICATED") {
      treeProvider?.setAuthenticated(true, "admin");
      panelManager?.notifyAllPanels({ type: "serverStatus", status: "connected" });
    } else if (state === "UNAUTHENTICATED") {
      treeProvider?.setAuthenticated(false);
      panelManager?.notifyAllPanels({ type: "serverStatus", status: "disconnected" });
    }
  });
}

function setupTreeView(context: vscode.ExtensionContext): void {
  treeProvider = new KiroTreeViewProvider(mcpManager!);
  const treeView = vscode.window.createTreeView("kiroSdlcTree", { treeDataProvider: treeProvider });
  treeProvider.setTreeView(treeView);
  context.subscriptions.push(treeView);
  treeView.onDidChangeSelection((e) => {
    const selected = e.selection[0];
    if (selected?.contextValue?.startsWith("cmd:")) {
      vscode.commands.executeCommand(selected.contextValue.replace("cmd:", ""));
    }
  });
}

function setupConfigWatcher(context: vscode.ExtensionContext, workspaceRoot: string, outputChannel: vscode.OutputChannel): void {
  configWatcher = new ConfigWatcher(workspaceRoot, mcpManager!, outputChannel);
  context.subscriptions.push(configWatcher);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration("kiroSdlc.mcpServerPort") || !mcpManager) { return; }
    const cfg = vscode.workspace.getConfiguration("kiroSdlc");
    if (!cfg.get<boolean>("enableMcpServer", true)) { return; }
    if (mcpManager.status === "running") { mcpManager.restart().then(() => vscode.window.showInformationMessage("MCP Server restarted")).catch((err) => vscode.window.showErrorMessage(`MCP Server restart failed: ${(err as Error).message}`)); }
    else { mcpManager.spawn().catch((err) => vscode.window.showErrorMessage(`MCP Server start failed: ${(err as Error).message}`)); }
  }));
}

function setupMcpStatusBroadcast(statusBar: vscode.StatusBarItem, workspaceRoot: string): void {
  mcpManager!.onStatusChange((status) => {
    const webviewStatus = mapServerStatusToWebview(status);
    panelManager?.notifyAllPanels({ type: "serverStatus", status: webviewStatus });
    updateStatusBar(statusBar);
    if (status === "running") {
      kbEventBus?.connect();
      configWatcher?.suppressNextChange();
      writeBundledMcpConfig(workspaceRoot, mcpManager?.port ?? 9181);
    } else if (status === "stopped" || status === "crashed") {
      kbEventBus?.disconnect();
    }
  });
}

async function autoSpawnServer(config: vscode.WorkspaceConfiguration, outputChannel: vscode.OutputChannel): Promise<void> {
  if (config.get<boolean>("enableMcpServer", true)) {
    try { await mcpManager!.spawn(); }
    catch (err) { outputChannel.appendLine(`[WARN] Auto-spawn failed: ${(err as Error).message}`); }
  } else {
    outputChannel.appendLine("[MCP] Server disabled by setting");
  }
}

// === Helpers ===

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "kiroSdlc.status";
  item.show();
  return item;
}

function updateStatusBar(item: vscode.StatusBarItem): void {
  const root = getWorkspaceRoot();
  if (!root) { item.text = "$(circle-slash) SDLC"; item.tooltip = "No workspace open"; return; }
  const status = checkStatus(root);
  const allPresent = Object.values(status).every(v => v);
  const serverIcon = mcpManager?.status === "running" ? "$(check)" : "$(warning)";
  item.text = allPresent ? `${serverIcon} SDLC Agents` : `$(warning) SDLC Agents`;
  const portInfo = mcpManager?.port ? ` | Port: ${mcpManager.port}` : "";
  item.tooltip = allPresent ? `All components active | MCP: ${mcpManager?.status || "N/A"}${portInfo}` : "Some components missing";
}

async function checkForUpgrade(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }
  migrateLegacyVersion(root, context.extensionPath);
  migrateLegacyScripts(root);
  if (!isUpgradeAvailable(root, context.extensionPath)) { return; }
  const manifest = loadBundledManifest(context.extensionPath);
  const action = await vscode.window.showInformationMessage(`🆕 SDLC update → v${manifest?.version || "?"}`, "Update Now", "Later");
  if (action === "Update Now") { vscode.commands.executeCommand("kiroSdlc.update"); }
}
