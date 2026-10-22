import { getSetting } from "../../config/settings-migration";
/**
 * Workspace-scoped activation pipeline — builds every manager, wires the chat
 * + enrichment + MCP features, and starts the server.
 * Extracted from extension.ts initializeWorkspace (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { getBackendUrl, DEFAULT_BACKEND_URL } from "../../config/backend-url";
import { McpServerManager } from "../../mcp-server-manager";
import { WebviewPanelManager } from "../../webview-panel-manager";
import { KbEventBus } from "../../kb-event-bus";
import { ChatPanelProvider } from "../../chat-panel/chat-panel-provider";
import { SessionManager } from "../../chat";
import { BasePanel } from "../../panels/base-panel";
import { AuthManager } from "../../auth/AuthManager";
import { StatusBarManager } from "../../ui/status-bar";
import { registerCommands } from "../../commands/CommandRegistrar";
import { registerLlmCommands } from "../../commands/LlmCommands";
import { KnowledgeClient } from "../../knowledge-client";
import { DiffTracker } from "../../chat/diff/DiffTracker";
import { DiffOriginalProvider } from "../../chat/diff/DiffOriginalProvider";
import { SessionLifecycleEmitter } from "../../chat/engine/SessionLifecycleEmitter";
import { initPlatformSwap } from "../../platform-swap";
import { runtime } from "./state";
import { deriveProjectId, setProjectId, getProjectId } from "./project-id";
import { setupAuthStateHandlers } from "./auth-state";
import { registerEnrichmentFeatures } from "./enrichment";
import { registerBackendUrlWatcher } from "./backend-url";
import { setupConfigWatcher, setupMcpStatusBroadcast, autoSpawnServer } from "./mcp-lifecycle";
import { openAgenticChat } from "./agentic-chat";

/**
 * Initialize everything that requires a workspace folder. Ordering is
 * significant — managers are created, then wired, then started.
 */
export async function initializeWorkspace(context: vscode.ExtensionContext, workspaceRoot: string): Promise<void> {
  setProjectId(await deriveProjectId(workspaceRoot));

  const outputChannel = vscode.window.createOutputChannel("Kiro MCP Server");
  context.subscriptions.push(outputChannel);

  const backendUrl = resolveBackendUrl();
  const mcpConfig = vscode.workspace.getConfiguration("sdlcAgents");

  runtime.authManager = new AuthManager(context.secrets, backendUrl);
  await runtime.authManager.initialize();

  runtime.statusBarManager = new StatusBarManager();
  runtime.statusBarManager.setAuthState(runtime.authManager.currentState);
  context.subscriptions.push(runtime.statusBarManager);

  runtime.mcpManager = new McpServerManager(workspaceRoot, outputChannel, runtime.authManager, backendUrl, context.secrets);
  context.subscriptions.push(runtime.mcpManager);

  runtime.kbEventBus = new KbEventBus(outputChannel, runtime.mcpManager);
  context.subscriptions.push(runtime.kbEventBus);

  runtime.panelManager = new WebviewPanelManager(runtime.mcpManager, context.extensionUri, runtime.kbEventBus);
  context.subscriptions.push(runtime.panelManager);

  BasePanel.authTokenProvider = () => runtime.authManager?.getTokenSync() || "";

  (globalThis as any).__authTokenProvider = () => runtime.authManager?.getTokenSync() || "";

  setupAuthStateHandlers();
  // Tree view is already registered in activate(); bind it to the live manager.
  runtime.treeProvider?.attachMcpManager(runtime.mcpManager!);

  const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatPanelProvider, { webviewOptions: { retainContextWhenHidden: true } }),
    chatPanelProvider
  );

  registerLlmCommands(context, chatPanelProvider);
  registerCommands(context, { mcpManager: runtime.mcpManager, panelManager: runtime.panelManager, authManager: runtime.authManager, treeProvider: runtime.treeProvider, workspaceRoot });

  registerAgenticChatCommand(context, workspaceRoot, chatPanelProvider, backendUrl);
  registerBackendUrlWatcher(context, outputChannel);
  registerDiffTracking(context, chatPanelProvider);

  setupConfigWatcher(context, workspaceRoot, outputChannel);
  setupMcpStatusBroadcast(workspaceRoot);
  await autoSpawnServer(mcpConfig, outputChannel);

  await registerEnrichmentFeatures(context, backendUrl, outputChannel);

  // Initialize Platform Swap feature (IDE-aware agent config swap)
  await initPlatformSwap(context, workspaceRoot, outputChannel).catch((err) => {
    const msg = `[PlatformSwap] Init failed: ${(err as Error).message}`;
    outputChannel.appendLine(msg);
    console.warn(msg);
    vscode.window.showWarningMessage(`Platform Swap initialization failed. Agent config swapping will be unavailable. Check Output > Kiro MCP Server for details.`);
  });
}

/** Resolve backend.url; validation failures fall back to the loopback default. */
function resolveBackendUrl(): string {
  try {
    return getBackendUrl();
  } catch (err: any) {
    console.warn(`[Security] backend.url validation failed at activate: ${err?.message} — falling back to loopback default`);
    return DEFAULT_BACKEND_URL;
  }
}

/** SA4E-85: register the Agentic Chat command + SessionManager (Backend KB hydrate). */
function registerAgenticChatCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  chatPanelProvider: ChatPanelProvider,
  backendUrl: string,
): void {
  const kbClient = new KnowledgeClient(backendUrl, {
    getHeaders: () => {
      const headers: Record<string, string> = { "X-Project-Id": getProjectId() };
      const token = runtime.authManager?.getTokenSync();
      if (token) { headers["Authorization"] = `Bearer ${token}`; }
      return headers;
    },
  });
  runtime.sessionManager = new SessionManager(workspaceRoot, kbClient);
  context.subscriptions.push(
    vscode.commands.registerCommand("sdlcAgents.openAgenticChat", () => {
      openAgenticChat(context, workspaceRoot, chatPanelProvider);
    })
  );
}

/** SA4E-183: DiffTracker + SessionLifecycleEmitter wiring. */
function registerDiffTracking(context: vscode.ExtensionContext, chatPanelProvider: ChatPanelProvider): void {
  runtime.sessionLifecycle = new SessionLifecycleEmitter();
  runtime.diffTracker = new DiffTracker(null, getSetting<boolean>('diffTracker.enabled', 'diffTracker.enabled', true));
  const diffOriginalProvider = new DiffOriginalProvider(runtime.diffTracker);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('diff-original', diffOriginalProvider)
  );
  // DiffTracker resets on new session
  runtime.sessionLifecycle.on('session:created', () => runtime.diffTracker?.clearSession());
  context.subscriptions.push({ dispose: () => { runtime.diffTracker?.dispose(); runtime.sessionLifecycle?.dispose(); } });
  chatPanelProvider.setDiffTracker(runtime.diffTracker);
}
