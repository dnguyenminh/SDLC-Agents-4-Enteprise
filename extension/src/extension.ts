/**
 * SDLC Agents 4 Enterprise — VS Code Extension entry point.
 * Thin activation shell — delegates command registration to CommandRegistrar and LlmCommands.
 */

import * as vscode from "vscode";
import { getWorkspaceRoot, checkForUpgrade } from "./activation-helpers";
import { McpServerManager } from "./mcp-server-manager";
import { WebviewPanelManager } from "./webview-panel-manager";
import { KiroTreeViewProvider } from "./sidebar/tree-view-provider";
import { writeBundledMcpConfig } from "./mcp-injector";
import { ConfigWatcher } from "./config-watcher";
import { KbEventBus } from "./kb-event-bus";
import { DiagnosticsFeedService } from "./langgraph/diagnostics/diagnostics-feed-service";
import { ChatPanelProvider } from "./chat-panel/chat-panel-provider";
import { ChatEngineAdapter, StreamProtocolAdapter, SessionManager } from "./chat";
import { MessageRouter } from "./chat/router/MessageRouter";
import { PostMessageBridge } from "./chat/bridge/PostMessageBridge";
import { ChatWebviewProvider } from "./chat/webview/ChatWebviewProvider";
import { IdeContextManager } from "./chat/context/IdeContextManager";
import { OpenCodeToolHandler } from "./chat/tools/OpenCodeToolHandler";
import { BasePanel } from "./panels/base-panel";
import { AuthManager } from "./auth/AuthManager";
import { mapServerStatusToWebview } from "./types";
import { registerCommands } from "./commands/CommandRegistrar";
import { registerLlmCommands } from "./commands/LlmCommands";
import { initPlatformSwap } from "./platform-swap";
import { StatusBarManager } from "./ui/status-bar";
import { SettingsPanel } from "./panels/settings/SettingsPanel";
import { ProxyAgentFactory } from "./proxy/ProxyAgentFactory";
import { ProxyConfigService } from "./proxy/ProxyConfigService";
import { ProxyDetectionService } from "./proxy/ProxyDetectionService";
import { applyGlobalFetchPatch } from "./proxy/global-fetch-patch";
import { KnowledgeClient } from "./knowledge-client";
import { DiffTracker } from "./chat/diff/DiffTracker";
import { DiffOriginalProvider } from "./chat/diff/DiffOriginalProvider";
import { SessionLifecycleEmitter } from "./chat/engine/SessionLifecycleEmitter";

let mcpManager: McpServerManager | undefined;
let panelManager: WebviewPanelManager | undefined;
let configWatcher: ConfigWatcher | undefined;
let kbEventBus: KbEventBus | undefined;
let treeProvider: KiroTreeViewProvider | undefined;
let authManager: AuthManager | undefined;
let statusBarManager: StatusBarManager | undefined;
let sessionManager: SessionManager | undefined;
let chatEngineAdapter: ChatEngineAdapter | undefined;
let diffTracker: DiffTracker | undefined;
let sessionLifecycle: SessionLifecycleEmitter | undefined;

/** Project ID for multi-tenant isolation — derived from git remote or user+folder hash. */
let _projectId = "";
export function getProjectId(): string { return _projectId; }
export function setProjectId(id: string): void { _projectId = id; }

/**
 * SA4E-241 SEC-01: Require a resolved project identity — fail-closed.
 * The projectId is derived from the authenticated Pega application context
 * (setProjectId). We MUST NOT fall back to a shared default like 'PegaCollProj'
 * (cross-tenant leak). Callers that need a scope must have run context resolution
 * first (fetchAndSavePegaContext / catalog indexer).
 * @throws Error when no project identity has been resolved yet.
 */
export function requireProjectId(): string {
  if (!_projectId) {
    throw new Error(
      "No project identity resolved. Run 'Fetch Pega App Context' (or index) first — " +
      "SA4E-241 forbids a hard-coded default project (SEC-01).",
    );
  }
  return _projectId;
}

/** SA4E-99: Enrichment service accessor for IndexingService cross-module call. */
export function getEnrichmentService(): { pollNow(): void } | null { return null; }

export async function activate(context: vscode.ExtensionContext) {
  // SA4E-99: Removed duplicate createStatusBar() — StatusBarManager handles status display

  // Register Settings command early — must work even without a workspace folder.
  context.subscriptions.push(
    vscode.commands.registerCommand("kiroSdlc.openSettings", () =>
      SettingsPanel.open(context.extensionUri, context.secrets)
    )
  );

  // Initialize proxy support (machine-specific, works without workspace)
  const proxyConfigService = new ProxyConfigService(context.secrets);
  const proxyDetectionService = new ProxyDetectionService();
  ProxyAgentFactory.initialize(proxyConfigService, proxyDetectionService);
  // Patch globalThis.fetch so ALL fetch() callers in this process route through proxy
  applyGlobalFetchPatch();

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    await initializeWorkspace(context, workspaceRoot);
  }

  checkForUpgrade(context);
}

export async function deactivate(): Promise<void> {
  configWatcher?.dispose();
  panelManager?.disposeAll();
  chatEngineAdapter?.dispose();
  diffTracker?.dispose();
  sessionLifecycle?.dispose();
  await sessionManager?.cleanup();
  // Must await kill() so VS Code waits for the HTTP server to release its port
  // before reloading — prevents EADDRINUSE on reload window.
  try {
    await mcpManager?.kill();
  } catch (err) {
    console.error("[Kiro] Deactivate kill failed:", (err as Error).message);
  }
}

/**
 * Derive a stable project ID for multi-tenant isolation.
 * Priority: .code-intel/project.json -> git remote hash -> user+folder hash.
 * SRP: Extracted from initializeWorkspace to keep the main function focused.
 */
export async function deriveProjectId(workspaceRoot: string): Promise<string> {
  const pathModule = await import("path");
  const fs = await import("fs");
  const crypto = await import("crypto");
  const os = await import("os");
  const cp = await import("child_process");

  const codeIntelDir = pathModule.resolve(workspaceRoot, ".code-intel");
  const pjPath = pathModule.resolve(codeIntelDir, "project.json");

  // 1. Explicit config
  try {
    if (fs.existsSync(pjPath)) {
      const pj = JSON.parse(fs.readFileSync(pjPath, "utf-8"));
      if (pj.projectId) { return pj.projectId as string; }
    }
  } catch (err) {
    console.warn(`[Kiro] Could not read .code-intel/project.json: ${(err as Error).message}`);
  }

  // 2. Git remote hash
  let projectId: string;
  try {
    const remote = cp.execSync("git remote get-url origin", { cwd: workspaceRoot, encoding: "utf-8", timeout: 3000 }).trim();
    if (remote) { projectId = crypto.createHash("sha256").update(remote).digest("hex").slice(0, 12); }
    else { projectId = ""; }
  } catch {
    projectId = "";
  }
  // 3. User + folder hash (always succeeds)
  if (!projectId) {
    const userId = os.userInfo().username || "unknown";
    const folderName = pathModule.basename(workspaceRoot) || "workspace";
    projectId = crypto.createHash("sha256").update(`${userId}:${folderName}`).digest("hex").slice(0, 12);
  }

  // Persist derived project ID for stability across reloads
  try {
    if (!fs.existsSync(codeIntelDir)) { fs.mkdirSync(codeIntelDir, { recursive: true }); }
    fs.writeFileSync(pjPath, JSON.stringify({ projectId }, null, 2), "utf-8");
  } catch (err) {
    console.warn(`[Kiro] Could not write .code-intel/project.json: ${(err as Error).message}`);
  }

  return projectId;
}

async function initializeWorkspace(context: vscode.ExtensionContext, workspaceRoot: string): Promise<void> {
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

  mcpManager = new McpServerManager(workspaceRoot, outputChannel, authManager, backendUrl, context.secrets);
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

  // SA4E-85: Register new Agentic Chat command (keeps old chat-panel for backward compat)
  // v3.1: SessionManager resolves thread_id from Backend KB (stateless, multi-IDE hydrate).
  const kbClient = new KnowledgeClient(backendUrl, {
    getHeaders: () => {
      const headers: Record<string, string> = { "X-Project-Id": getProjectId() };
      const token = authManager?.getTokenSync();
      if (token) { headers["Authorization"] = `Bearer ${token}`; }
      return headers;
    },
  });
  sessionManager = new SessionManager(workspaceRoot, kbClient);
  context.subscriptions.push(
    vscode.commands.registerCommand("kiroSdlc.openAgenticChat", () => {
      openAgenticChat(context, workspaceRoot, chatPanelProvider);
    })
  );

  // SA4E-185: Initialize Diagnostics Feed Service
  const diagnosticsFeedService = new DiagnosticsFeedService(workspaceRoot);
  context.subscriptions.push(diagnosticsFeedService.start());
  // Pass to ChatPanelProvider so it can be used by LangGraphEngine
  chatPanelProvider.setDiagnosticsFeedService(diagnosticsFeedService);

  // SA4E-183: Initialize DiffTracker + SessionLifecycleEmitter
  sessionLifecycle = new SessionLifecycleEmitter();
  diffTracker = new DiffTracker(null, vscode.workspace.getConfiguration('kiroSdlc').get<boolean>('diffTracker.enabled', true));
  const diffOriginalProvider = new DiffOriginalProvider(diffTracker);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('diff-original', diffOriginalProvider)
  );
  // DiffTracker resets on new session
  sessionLifecycle.on('session:created', () => diffTracker?.clearSession());
  context.subscriptions.push({ dispose: () => { diffTracker?.dispose(); sessionLifecycle?.dispose(); } });
  chatPanelProvider.setDiffTracker(diffTracker);
  // Live toggle watcher (BR-9) — follows extension.ts:307 pattern (NOT ConfigWatcher)
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration("kiroSdlc.enableDiagnosticsFeed")) { return; }
    const enabled = vscode.workspace.getConfiguration("kiroSdlc")
      .get<boolean>("enableDiagnosticsFeed", true);
    diagnosticsFeedService.setEnabled(enabled);
  }));

  setupConfigWatcher(context, workspaceRoot, outputChannel);
  setupMcpStatusBroadcast(workspaceRoot);
  await autoSpawnServer(mcpConfig, outputChannel);

  // SA4E-157: Enrichment status polling + StatusBarItem
  try {
    const { IndexerHttpClient } = await import('./services/IndexerHttpClient');
    const { EnrichmentStatusService } = await import('./services/EnrichmentStatusService');
    const enrichmentClient = new IndexerHttpClient(backendUrl);
    const enrichmentService = new EnrichmentStatusService(
      enrichmentClient,
      () => authManager?.getTokenSync(),
      outputChannel,
    );
    // Only start polling after user authenticates (enrichment data is per-user)
    if (authManager?.isAuthenticated) {
      enrichmentService.start();
    }
    authManager?.onStateChange((state) => {
      if (state === "AUTHENTICATED") { enrichmentService.start(); }
    });
    context.subscriptions.push(enrichmentService);
    // SA4E-157: Show enrichment status in Output Channel
    context.subscriptions.push(
      vscode.commands.registerCommand('sa4e.showEnrichmentStatus', async () => {
        const status = await enrichmentService.pollNow();
        if (!status) {
          vscode.window.showErrorMessage('Cannot reach backend. Verify server is running.');
          return;
        }
        // Open Enrichment Dashboard WebView panel (SA4E-169)
        const { openEnrichmentDashboard } = await import('./panels/enrichment-dashboard-panel');
        openEnrichmentDashboard(context.extensionUri, enrichmentService.buildDashboardData(status));
      })
    );
    // SA4E-160: Retry failed enrichment tasks command
    context.subscriptions.push(
      vscode.commands.registerCommand('sa4e.retryFailedEnrichment', async () => {
        try {
          const res = await fetch(`${backendUrl}/api/v1/enrichment/retry-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authManager?.getTokenSync() || ''}` },
          });
          if (!res.ok) {
            vscode.window.showErrorMessage(`Retry failed: HTTP ${res.status}`);
            return;
          }
          const json = (await res.json()) as any;
          const count = json.data?.resetCount ?? 0;
          vscode.window.showInformationMessage(`${count} failed tasks queued for retry. Enrichment will resume shortly.`);
          await enrichmentService.pollNow();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Retry failed: ${err.message}`);
        }
      })
    );
  } catch (err) {
    outputChannel.appendLine(`[EnrichmentStatus] Init failed: ${(err as Error).message}`);
  }

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

function setupMcpStatusBroadcast(workspaceRoot: string): void {
  mcpManager!.onStatusChange((status) => {
    const webviewStatus = mapServerStatusToWebview(status);
    panelManager?.notifyAllPanels({ type: "serverStatus", status: webviewStatus });
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


/**
 * SA4E-85: Open the new Agentic Chat panel.
 * Creates MessageRouter → PostMessageBridge → ChatWebviewProvider → ChatEngineAdapter pipeline.
 * Keeps old chat-panel working for backward compatibility.
 */
function openAgenticChat(context: vscode.ExtensionContext, workspaceRoot: string, chatPanel: ChatPanelProvider): void {
  // Lazy-create the adapter and webview on first invocation
  if (!chatEngineAdapter) {
    const router = new MessageRouter(undefined);
    const bridge = new PostMessageBridge(undefined);
    const webviewProvider = new ChatWebviewProvider(context.extensionUri, router);
    const streamAdapter = new StreamProtocolAdapter();
    const contextManager = new IdeContextManager(200000, () => new vscode.EventEmitter());
    const toolHandler = new OpenCodeToolHandler(async () => ({ diffId: '', filePath: '', patch: '', fileHashAtGeneration: '', generatedAt: 0, status: 'pending' as const }));

    // Access engine from chatPanel (it exposes getEngine internally)
    const engine = (chatPanel as any).getEngine?.() ?? (chatPanel as any).engine;
    if (!engine) {
      vscode.window.showWarningMessage("Agentic Chat requires an active LLM connection. Please configure an LLM provider first.");
      return;
    }

    chatEngineAdapter = new ChatEngineAdapter({
      router,
      bridge,
      engine,
      streamAdapter,
      contextManager,
      toolHandler,
      sessionManager: sessionManager!,
      // SA4E-185 C-2 (B1): share the engine's approval gate so webview
      // TOOL_CALL_RESPONSE resolves the same gate the LangGraph chat path blocks on.
      approvalGate: (engine as any).approvalGate,
      // SA4E-183: DiffTracker for file change tracking
      diffTracker,
    });

    chatEngineAdapter.initialize();

    // Wire bridge to router (incoming webview messages)
    bridge.onMessage((msg) => router.dispatch(msg));

    // Show the webview panel
    webviewProvider.show(vscode.ViewColumn.Beside);

    // Wire the panel to the bridge after creation
    const panel = webviewProvider.getPanel();
    if (panel) {
      bridge.attachPanel(panel);
      router.setPanel(panel);
    }

    context.subscriptions.push(chatEngineAdapter);
    context.subscriptions.push({ dispose: () => router.dispose() });
    context.subscriptions.push({ dispose: () => bridge.dispose() });
    context.subscriptions.push(webviewProvider);
  } else {
    // Already initialized — just show
    vscode.commands.executeCommand("workbench.action.focusPanel");
  }
}
