/**
 * ChatPanelProvider — KSA-210
 * WebviewViewProvider for the Chat Panel sidebar.
 * Delegates status, models, state to extracted managers.
 */

import * as vscode from "vscode";
import { debugLog } from "../debug-logger";
import { IServerManager } from "../types/server-types";
import { PiWorkflowAdapter, KbRemoteCheckpointerStore } from "../pi-workflow";
import { createLlmProvider } from "../langgraph/providers";
import { MessageHandler } from "./message-handler";
import { ChatWebviewToExtMessage, ChatExtToWebviewMessage } from "./message-protocol";
import { ContextUsageTracker } from "./context-usage-tracker";
import { ChatStatusManager } from "./ChatStatusManager";
import { ChatModelManager } from "./ChatModelManager";
import { ChatStateManager } from "./ChatStateManager";
import { DiagnosticsFeedService } from "../langgraph/diagnostics/diagnostics-feed-service";

export class ChatPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "kiroChatPanel";

  private view: vscode.WebviewView | undefined;
  private engine: PiWorkflowAdapter | null = null;
  private messageHandler: MessageHandler | null = null;
  private messageBuffer: ChatExtToWebviewMessage[] = [];
  private contextUsageTracker: ContextUsageTracker = new ContextUsageTracker();
  private steeringCounted = false;
  private toolDefinitionsCounted = false;

  /**
   * SA4E-182: Send initial context usage on panel load.
   * Reads steering files from disk + estimates MCP tool definitions.
   * Syncs maxTokens from provider if engine already detected context window.
   */
  private async sendInitialContextUsage(): Promise<void> {
    const tabId = "default";
    try {
      // SA4E-182: Eagerly detect context window from provider's /v1/models endpoint.
      // This is the single source of truth for local servers (llama-server -c flag).
      // Static model map is unreliable because user controls context size via CLI args.
      const engine = this.getEngine();
      const detectedWindow = engine.getDetectedContextWindow();
      if (detectedWindow && detectedWindow > 0) {
        this.contextUsageTracker.setMaxTokens(detectedWindow);
      } else {
        // Provider hasn't detected yet — trigger detection now (fast: single HTTP call)
        await engine.detectContextWindowEarly();
        const freshWindow = engine.getDetectedContextWindow();
        if (freshWindow && freshWindow > 0) {
          this.contextUsageTracker.setMaxTokens(freshWindow);
        }
        // If still 0 (provider offline), keep default 128000 — will sync on first invoke
      }
      // 1. Count steering tokens — match actual injectSteering() budget (MAX_STEERING_CHARS=4000)
      // Plus base system prompt + agent instructions overhead
      if (!this.steeringCounted) {
        // injectSteering caps at 4000 chars of steering content + system prompt base (~3500 chars)
        const SYSTEM_PROMPT_BASE_CHARS = 3500;
        const MAX_STEERING_CHARS = 4000; // mirrors steering-loader.ts injectSteering budget
        const steeringChars = SYSTEM_PROMPT_BASE_CHARS + MAX_STEERING_CHARS;
        this.contextUsageTracker.updateSteeringTokens(tabId, ["x".repeat(steeringChars)]);
        this.steeringCounted = true;
      }

      // 2. Count MCP + VS Code tool definitions via engine's McpBridge
      try {
        const engine = this.getEngine();
        const tools = await engine.listAvailableTools();
        if (tools.length > 0) {
          // Build tool text matching what LLM actually receives (name + description + schema)
          const toolText = tools.map((t: any) =>
            `${t.name}: ${t.description || ""} ${JSON.stringify(t.inputSchema || {})}`
          ).join("\n");
          this.contextUsageTracker.addToolTokens(tabId, toolText);
          debugLog(`[ChatPanel] MCP tools counted: ${tools.length} tools, ~${Math.ceil(toolText.length / 4)} tokens`);
        }
      } catch (err) {
        debugLog(`[ChatPanel] MCP tool counting failed (non-fatal): ${(err as Error).message}`);
      }

      // 3. Send to webview
      const payload = this.contextUsageTracker.getUsagePayload(tabId);
      console.log(`[ChatPanel] sendInitialContextUsage: steeringCounted=${this.steeringCounted}, total=${payload.total.tokens}, steering=${payload.steering.tokens}`);
      this.sendToWebview({
        type: "tab:contextUpdate",
        payload: {
          tabId,
          tokenCount: payload.total.tokens,
          maxTokens: payload.maxTokens,
          breakdown: {
            conversation: payload.conversation.percentage,
            mcpTools: payload.mcpTools.percentage,
            steering: payload.steering.percentage,
          },
        },
      } as any);
    } catch (err) {
      debugLog(`[ChatPanel] sendInitialContextUsage error: ${(err as Error).message}`);
    }
  }
  private disposables: vscode.Disposable[] = [];

  private readonly statusManager: ChatStatusManager;
  private readonly modelManager: ChatModelManager;
  private readonly stateManager: ChatStateManager;
  private diagnosticsFeedService: DiagnosticsFeedService | null = null;
  private diffTracker: import('../chat/diff/IDiffTracker').IDiffTracker | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly mcpManager: IServerManager,
    private readonly workspaceRoot: string,
    private readonly secrets?: vscode.SecretStorage,
    private readonly workspaceState?: vscode.Memento
  ) {
    this.statusManager = new ChatStatusManager(mcpManager, secrets, (msg) => this.sendToWebview(msg));
    this.modelManager = new ChatModelManager((msg) => this.sendToWebview(msg));
    this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());
    this.disposables.push(this.stateManager);
  }

  /** SA4E-185: Set the diagnostics feed service for the engine. */
  setDiagnosticsFeedService(diagnosticsFeedService: DiagnosticsFeedService | undefined) {
    this.diagnosticsFeedService = diagnosticsFeedService ?? null;
    // Propagate to the engine so the PiWorkflowAdapter (and its consumers) see the feed.
    if (this.engine) {
      (this.engine as unknown as { setDiagnosticsFeed?: (f: unknown) => void }).setDiagnosticsFeed?.(diagnosticsFeedService);
      (this.engine as unknown as { diagnosticsFeed?: unknown }).diagnosticsFeed = diagnosticsFeedService;
    }
  }

  /** SA4E-183: Set the DiffTracker for file change tracking. */
  setDiffTracker(tracker: import('../chat/diff/IDiffTracker').IDiffTracker): void {
    this.diffTracker = tracker;
  }

  resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "webview-assets"), vscode.Uri.joinPath(this.extensionUri, "out")] };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg: ChatWebviewToExtMessage) => this.routeMessage(msg), undefined, this.disposables);
    webviewView.onDidDispose(() => { this.view = undefined; });
    webviewView.onDidChangeVisibility(() => this.flushBuffer(webviewView));
    this.mcpManager.onStatusChange(() => { void this.statusManager.sendCombinedStatus(); }, undefined, this.disposables);
    this.disposables.push(vscode.workspace.onDidChangeConfiguration((e) => this.onConfigChange(e)));
  }

  notifyLlmStatusChanged(status: "connected" | "disconnected"): void {
    console.log(`[ChatPanel] notifyLlmStatusChanged: ${status}, view=${!!this.view}`);
    this.statusManager.notifyLlmStatusChanged(status);
  }

  saveChatState(state: { tabs: unknown[]; activeTabId: string; messageHistory?: string[] }): void {
    this.stateManager.saveChatState(state);
    // SA4E-182: Update context usage whenever chat state is saved (fires after every turn)
    this.updateContextUsageFromSavedState(state);
  }

  sendContextUsage(tabId: string): void {
    const payload = this.contextUsageTracker.getUsagePayload(tabId);
    this.sendToWebview({ type: "chat:contextUsage", payload });
  }

  /**
   * SA4E-182: Update context token usage after each LLM turn completes.
   * Counts conversation messages, estimates steering + tool tokens.
   * Syncs maxTokens from provider's detected context window (e.g., 32768 from llama-server).
   * Sends tab:contextUpdate to webview (which chat.js handleContextUpdate handles).
   */
  private updateContextUsageAfterTurn(): void {
    try {
      const engine = this.engine;
      if (!engine) return;
      const tabId = "default";

      // SA4E-182: Sync maxTokens from detected context window (provider.getContextWindow())
      // After first ensureGraph() call, detectContextWindow() has run and provider
      // reports the actual value (e.g., 32768 for llama-server -c 65536 -np 2).
      const detectedWindow = engine.getDetectedContextWindow();
      if (detectedWindow && detectedWindow > 0) {
        this.contextUsageTracker.setMaxTokens(detectedWindow);
      }

      const messages = engine.getChatHistory() || [];
      debugLog(`[ChatPanel] updateContextUsageAfterTurn: ${messages.length} messages, maxTokens=${detectedWindow || "default"}`);

      // Count conversation tokens from messages
      this.contextUsageTracker.updateFromMessages(
        tabId,
        messages.map((m: any) => ({ content: m.content || "" }))
      );

      // Estimate steering tokens on first call — match injectSteering() actual budget
      if (!this.steeringCounted) {
        // System prompt base (~3500) + MAX_STEERING_CHARS (4000) = 7500 chars
        this.contextUsageTracker.updateSteeringTokens(tabId, [
          "x".repeat(7500),
        ]);
        this.steeringCounted = true;
      }

      // SA4E-182: Count MCP tool definitions (schema sent to LLM on every request).
      // These are constant for the session — count once after engine has fetched tools.
      if (!this.toolDefinitionsCounted) {
        void engine.listAvailableTools().then(tools => {
          if (tools.length > 0) {
            const toolText = tools.map((t: any) =>
              `${t.name}: ${t.description || ""} ${JSON.stringify(t.inputSchema || {})}`
            ).join("\n");
            const usage = (this.contextUsageTracker as any).tabUsage?.get(tabId);
            if (usage) { usage.mcpTools = Math.ceil(toolText.length / 4); }
            this.toolDefinitionsCounted = true;
            debugLog(`[ChatPanel] Tool definitions counted: ${tools.length} tools, ~${Math.ceil(toolText.length / 4)} tokens`);
          }
        }).catch(() => { /* non-fatal */ });
      }

      // Send tab:contextUpdate with breakdown
      const payload = this.contextUsageTracker.getUsagePayload(tabId);
      debugLog(`[ChatPanel] context payload: total=${payload.total.tokens}, conv=${payload.conversation.tokens}, mcp=${payload.mcpTools.tokens}, steer=${payload.steering.tokens}`);
      this.sendToWebview({
        type: "tab:contextUpdate",
        payload: {
          tabId,
          tokenCount: payload.total.tokens,
          maxTokens: payload.maxTokens,
          breakdown: {
            conversation: payload.conversation.percentage,
            mcpTools: payload.mcpTools.percentage,
            steering: payload.steering.percentage,
          },
        },
      } as any);
    } catch (err) {
      debugLog(`[ChatPanel] updateContextUsageAfterTurn error (non-fatal): ${(err as Error).message}`);
    }
  }

  /**
   * SA4E-182: Update context from saved state (triggered by saveChatState debounce).
   * This is the reliable path — fires every time webview saves state after messages change.
   */
  private updateContextUsageFromSavedState(state: { tabs: unknown[]; activeTabId: string }): void {
    try {
      const tabId = "default";
      const tabs = state.tabs as Array<{ id: string; messages?: Array<{ content?: string; role?: string }> }>;
      const activeTab = tabs.find(t => t.id === state.activeTabId) || tabs[0];
      if (!activeTab?.messages || activeTab.messages.length === 0) return;

      // Count conversation tokens
      this.contextUsageTracker.updateFromMessages(
        tabId,
        activeTab.messages.map(m => ({ content: m.content || "" }))
      );

      // SA4E-182: Sync maxTokens from detected context window
      if (this.engine) {
        const detectedWindow = this.engine.getDetectedContextWindow();
        if (detectedWindow && detectedWindow > 0) {
          this.contextUsageTracker.setMaxTokens(detectedWindow);
        }
      }

      // Tool definitions are counted once by updateContextUsageAfterTurn or sendInitialContextUsage.
      // Don't overwrite mcpTools here — they represent constant tool schema tokens, not message content.

      // Steering (count once) — match injectSteering() budget
      if (!this.steeringCounted) {
        this.contextUsageTracker.updateSteeringTokens(tabId, ["x".repeat(7500)]);
        this.steeringCounted = true;
      }

      // Send update
      const payload = this.contextUsageTracker.getUsagePayload(tabId);
      this.sendToWebview({
        type: "tab:contextUpdate",
        payload: {
          tabId,
          tokenCount: payload.total.tokens,
          maxTokens: payload.maxTokens,
          breakdown: {
            conversation: payload.conversation.percentage,
            mcpTools: payload.mcpTools.percentage,
            steering: payload.steering.percentage,
          },
        },
      } as any);
    } catch {
      // Non-fatal
    }
  }

  getContextUsageTracker(): ContextUsageTracker {
    return this.contextUsageTracker;
  }

  dispose(): void {
    this.engine?.dispose();
    this.diagnosticsFeedService?.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  // === Private routing ===

  private routeMessage(msg: ChatWebviewToExtMessage): void {
    if ((msg as any).type === "executeCommand" && (msg as any).command) {
      vscode.commands.executeCommand((msg as any).command);
      return;
    }
    if (msg.type === "chat:saveState") {
      this.stateManager.saveChatState(msg.payload);
      return;
    }
    if ((msg as any).type === "chat:debugLog") {
      debugLog(`[webview] ${(msg as any).text}`);
      return;
    }
    if (msg.type === "ready") {
      void this.statusManager.sendCombinedStatus();
      void this.modelManager.sendModels();
      this.stateManager.restoreChatState();
      this.stateManager.sendSteeringInfo();
      this.stateManager.sendAgentsInfo();
      this.stateManager.sendSkillsInfo();
      void this.sendInitialContextUsage();
    }
    this.handleMessage(msg);
  }

  private onConfigChange(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("kiroSdlc.llmProvider") || e.affectsConfiguration("kiroSdlc.llmModel")) {
      if (this.engine && this.secrets) { this.engine.setLlmProvider(createLlmProvider(this.secrets)); }
      void this.modelManager.sendModels();
      void this.statusManager.sendCombinedStatus();
    }
    if (e.affectsConfiguration("kiroSdlc.anthropicBaseUrl") || e.affectsConfiguration("kiroSdlc.openaiBaseUrl") || e.affectsConfiguration("kiroSdlc.ollamaUrl")) {
      void this.statusManager.sendCombinedStatus();
    }
  }

  private flushBuffer(webviewView: vscode.WebviewView): void {
    if (webviewView.visible && this.messageBuffer.length > 0) {
      for (const msg of this.messageBuffer) {
        webviewView.webview.postMessage(msg);
      }
      this.messageBuffer = [];
    }
  }

  private sendToWebview(msg: ChatExtToWebviewMessage): void {
    if (this.view) {
      this.view.webview.postMessage(msg);
      if ((msg as any).type === "serverStatus") {
        console.log(`[ChatPanel] postMessage serverStatus: ${(msg as any).status}`);
      }
    } else {
      this.messageBuffer.push(msg);
      if (this.messageBuffer.length > 200) { this.messageBuffer.shift(); }
    }
  }

  private getEngine(): PiWorkflowAdapter {
    if (!this.engine) {
      this.engine = new PiWorkflowAdapter({
        mcpManager: this.mcpManager,
        workspaceRoot: this.workspaceRoot,
        onEvent: (msg) => this.sendToWebview(msg),
        llmProvider: this.secrets ? createLlmProvider(this.secrets) : undefined,
        diagnosticsFeed: this.diagnosticsFeedService ?? undefined,
        checkpointerStore: new KbRemoteCheckpointerStore({
          workspaceRoot: this.workspaceRoot,
        }),
      });
    }
    // Keep the engine's diagnostics feed in sync with the provider's stored service.
    if (this.diagnosticsFeedService) {
      this.engine.setDiagnosticsFeed(this.diagnosticsFeedService);
    }
    return this.engine;
  }

  private getMessageHandler(): MessageHandler {
    if (!this.messageHandler) {
      this.messageHandler = new MessageHandler(() => this.getEngine(), (msg) => this.sendToWebview(msg), this.workspaceRoot, (ct) => this.handlePickContext(ct), () => this.handlePickAttachment(), (code, filePath) => this.handleApplyCode(code, filePath), (code) => this.handleInsertCode(code), (model) => this.handleSetModel(model), () => this.updateContextUsageAfterTurn(), () => this.stateManager.broadcastInitialState());
    }
    return this.messageHandler;
  }

  private async handleMessage(msg: ChatWebviewToExtMessage): Promise<void> {
    try {
      await this.getMessageHandler().handle(msg);
    } catch (error) {
      this.sendToWebview({
        type: "chat:error", code: "HANDLER_ERROR",
        message: (error as Error).message, retryable: true,
      });
    }
  }

  private async handleSetModel(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    try {
      await config.update("llmModel", model === "auto" ? undefined : model, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.debug("[ChatPanelProvider] handleSetModel config update failed: " + (err as Error).message);
    }
  }

  private async handlePickContext(contextType: string): Promise<void> {
    const { ChatContextPicker } = require("./ChatContextPicker");
    const picker = new ChatContextPicker(this.workspaceRoot, (msg: ChatExtToWebviewMessage) => this.sendToWebview(msg));
    await picker.pick(contextType);
  }

  private async handlePickAttachment(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true, title: "Attach Files", filters: { "All Files": ["*"] } });
    if (!uris) { return; }
    for (const uri of uris) { this.sendToWebview({ type: "chat:contextPicked", item: { type: "file", label: vscode.workspace.asRelativePath(uri), path: uri.fsPath } }); }
  }

  private async handleApplyCode(code: string, filePath?: string): Promise<void> {
    let editor = vscode.window.activeTextEditor;

    // If no active editor but filePath provided, open that file
    if (!editor && filePath) {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
      const fullPath = require("path").isAbsolute(filePath) ? filePath : require("path").join(wsRoot, filePath);
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        editor = await vscode.window.showTextDocument(doc);
      } catch (err) {
        console.warn("[ChatPanelProvider] handleApplyCode failed to open file: " + (err as Error).message);
        vscode.window.showWarningMessage(`Cannot open file: ${filePath}`);
        return;
      }
    }

    if (!editor) {
      vscode.window.showWarningMessage("No active editor. Open the target file first, then click Apply.");
      return;
    }

    // Replace entire file content if selection is empty and code looks like full file
    const hasImports = code.trimStart().startsWith("import ") || code.trimStart().startsWith("package ");
    if (editor.selection.isEmpty && hasImports) {
      const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
      await editor.edit((eb) => { eb.replace(fullRange, code); });
    } else {
      await editor.edit((eb) => { editor!.selection.isEmpty ? eb.insert(editor!.selection.active, code) : eb.replace(editor!.selection, code); });
    }
  }

  private async handleInsertCode(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) { await editor.edit((eb) => eb.insert(editor.selection.active, code)); }
    else { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: code })); }
  }

  private getHtml(webview: vscode.Webview): string {
    const { ChatHtmlBuilder } = require("./ChatHtmlBuilder");
    return ChatHtmlBuilder.build(webview, this.extensionUri);
  }
}

