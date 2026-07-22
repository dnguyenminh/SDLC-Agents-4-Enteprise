/**
 * SDLC Agents 4 Enterprise — VS Code Extension entry point.
 * Thin activation shell — delegates command registration to CommandRegistrar and LlmCommands.
 */

import * as vscode from "vscode";
import { getWorkspaceRoot, createStatusBar, updateStatusBar, checkForUpgrade } from "./activation-helpers";
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
import { StatusBarManager } from "./ui/status-bar";

let mcpManager: McpServerManager | undefined;
let panelManager: WebviewPanelManager | undefined;
let configWatcher: ConfigWatcher | undefined;
let kbEventBus: KbEventBus | undefined;
let treeProvider: KiroTreeViewProvider | undefined;
let authManager: AuthManager | undefined;
let statusBarManager: StatusBarManager | undefined;

/** Project ID for multi-tenant isolation — derived from git remote or user+folder hash. */
let _projectId = "default";
export function getProjectId(): string { return _projectId; }

export async function activate(context: vscode.ExtensionContext) {
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    await initializeWorkspace(context, workspaceRoot, statusBar);
  }

  updateStatusBar(statusBar, mcpManager);
  checkForUpgrade(context);
}

export function deactivate() {
  configWatcher?.dispose();
  mcpManager?.kill().catch((err) => console.error("[Kiro] Deactivate kill failed:", (err as Error).message));
  panelManager?.disposeAll();
}

/**
 * Derive a stable project ID for multi-tenant isolation.
 * Priority: .code-intel/project.json -> git remote hash -> user+folder hash.
 * SRP: Extracted from initializeWorkspace to keep the main function focused.
 */
async function deriveProjectId(workspaceRoot: string): Promise<string> {
  const pathModule = await import("path");
  const fs = await import("fs");
  const crypto = await import("crypto");
  const os = await import("os");
  const cp = await import("child_process");

  // 1. Explicit config
  try {
    const pjPath = pathModule.resolve(workspaceRoot, ".code-intel", "project.json");
    if (fs.existsSync(pjPath)) {
      const pj = JSON.parse(fs.readFileSync(pjPath, "utf-8"));
      if (pj.projectId) { return pj.projectId as string; }
    }
  } catch (err) {
    console.warn(`[Kiro] Could not read .code-intel/project.json: ${(err as Error).message}`);
  }
  // 2. Git remote hash
  try {
    const remote = cp.execSync("git remote get-url origin", { cwd: workspaceRoot, encoding: "utf-8", timeout: 3000 }).trim();
    if (remote) { return crypto.createHash("sha256").update(remote).digest("hex").slice(0, 12); }
  } catch (err) {
    console.debug(`[extension] git remote lookup failed (non-fatal): ${(err as Error).message}`);
    /* no git remote - use user+folder hash */
  }
  // 3. User + folder hash (always succeeds)
  const userId = os.userInfo().username || "unknown";
  const folderName = pathModule.basename(workspaceRoot) || "default";
  return crypto.createHash("sha256").update(`${userId}:${folderName}`).digest("hex").slice(0, 12);
}

async function initializeWorkspace(context: vscode.ExtensionContext, workspaceRoot: string, statusBar: vscode.StatusBarItem): Promise<void> {
  _projectId = await deriveProjectId(workspaceRoot);

  const outputChannel = vscode.window.createOutputChannel("Kiro MCP Server");
  context.subscriptions.push(outputChannel);

  const mcpConfig = vscode.workspace.getConfiguration("kiroSdlc");
  const backendUrl = mcpConfig.get<string>("backend.url") || "http://127.0.0.1:48721";

  authManager = new AuthManager(context.secrets, backendUrl);
  await authManager.initialize();

  statusBarManager = new StatusBarManager();
  statusBarManager.setAuthState(authManager.currentState);
  context.subscriptions.push(statusBarManager);

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
  await initPlatformSwap(context, workspaceRoot, outputChannel).catch((err) => {
    const msg = `[PlatformSwap] Init failed: ${(err as Error).message}`;
    outputChannel.appendLine(msg);
    console.warn(msg);
    vscode.window.showWarningMessage(`Platform Swap initialization failed. Agent config swapping will be unavailable. Check Output > Kiro MCP Server for details.`);
  });
}

function setupAuthStateHandlers(): void {
  let wasAuthenticated = authManager?.isAuthenticated ?? false;
  authManager?.onStateChange((state) => {
    statusBarManager?.setAuthState(state);
    if (state === "AUTHENTICATED") {
      wasAuthenticated = true;
      treeProvider?.setAuthenticated(true, "admin");
      panelManager?.notifyAllPanels({ type: "serverStatus", status: "connected" });
    } else if (state === "UNAUTHENTICATED") {
      treeProvider?.setAuthenticated(false);
      panelManager?.notifyAllPanels({ type: "serverStatus", status: "disconnected" });
      // SA4E-39: Warn user when session expires (only if was previously authenticated)
      if (wasAuthenticated) {
        wasAuthenticated = false;
        vscode.window.showWarningMessage(
          "Session expired. Knowledge base sync is paused. Please login to resume.",
          "Login"
        ).then((action) => {
          if (action === "Login") { vscode.commands.executeCommand("kiroSdlc.login"); }
        });
      }
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
    updateStatusBar(statusBar, mcpManager);
    // SA4E-39: Update StatusBarManager connection state from MCP status
    const connState = status === "running" ? "CONNECTED" : status === "starting" ? "CONNECTING" : "DISCONNECTED";
    statusBarManager?.setConnectionState(connState);
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
    catch (err) {
      const msg = `Auto-spawn failed: ${(err as Error).message}`;
      outputChannel.appendLine(`[WARN] ${msg}`);
      // Show user-visible warning so they know the server did not start
      vscode.window.showWarningMessage(`Kiro: MCP server failed to start. ${msg}. Some features may be unavailable.`);
    }
  } else {
    outputChannel.appendLine("[MCP] Server disabled by setting");
  }
}