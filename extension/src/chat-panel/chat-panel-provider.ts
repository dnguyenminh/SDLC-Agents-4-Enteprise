/**
 * ChatPanelProvider — KSA-210
 * WebviewViewProvider for the Chat Panel sidebar.
 * Delegates status, models, state to extracted managers.
 *
 * Context-usage accounting, engine creation, message dispatch and code
 * actions live in ./chat-panel-provider/ modules.
 */

import * as vscode from "vscode";
import { IServerManager } from "../types/server-types";
import { PiWorkflowAdapter } from "../pi-workflow";
import { createLlmProvider } from "../mcp/providers";
import { MessageHandler } from "./message-handler";
import { ChatWebviewToExtMessage, ChatExtToWebviewMessage } from "./message-protocol";
import { ContextUsageTracker } from "./context-usage-tracker";
import { SessionCompactor } from "../pi-agent/session-compactor";
import { ChatStatusManager } from "./ChatStatusManager";
import { ChatModelManager } from "./ChatModelManager";
import { ChatStateManager } from "./ChatStateManager";
import { syncPeerTabNames } from "../pi-workflow/peer/lifecycle";
import { CountedFlags } from "./chat-panel-provider/counted-flags";
import { sendInitialContextUsage as runInitialContextUsage, updateContextUsageFromSavedState as runSavedStateContextUsage } from "./chat-panel-provider/context-usage";
import type { ContextUsageDeps } from "./chat-panel-provider/context-usage";
import { updateContextUsageAfterTurn as runContextUsageAfterTurn } from "./chat-panel-provider/context-compaction";
import { createChatEngine } from "./chat-panel-provider/engine-factory";
import { applyChatConfigChange } from "./chat-panel-provider/config-change";
import { handleBuiltinChatMessage } from "./chat-panel-provider/message-dispatch";
import { applyCodeToEditor, insertCodeToEditor, pickAttachmentFiles, pickChatContext } from "./chat-panel-provider/code-actions";
import { setLlmModelConfig } from "./chat-panel-provider/model-config";

export class ChatPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "sdlcChatPanel";

  private view: vscode.WebviewView | undefined;
  private engine: PiWorkflowAdapter | null = null;
  private messageHandler: MessageHandler | null = null;
  private messageBuffer: ChatExtToWebviewMessage[] = [];
  private contextUsageTracker: ContextUsageTracker = new ContextUsageTracker();
  private sessionCompactor: SessionCompactor = new SessionCompactor();
  private readonly countedFlags = new CountedFlags();
  private readonly contextUsageDeps: ContextUsageDeps;
  private disposables: vscode.Disposable[] = [];

  private readonly statusManager: ChatStatusManager;
  private readonly modelManager: ChatModelManager;
  private readonly stateManager: ChatStateManager;
  private readonly engineListeners = new Set<(msg: ChatExtToWebviewMessage) => void>();
  /** SA4E-391 Bug 1: track the producing tab per streamId / per tool-call id
   * so a late event can never be re-stamped with another turn's tab. */
  private readonly streamTurnTabId = new Map<string, string>();
  private readonly toolCallTabId = new Map<string, string>();
  private turnTabId: string | undefined;
  private diffTracker: import('../chat/diff/IDiffTracker').IDiffTracker | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly mcpManager: IServerManager,
    private readonly workspaceRoot: string,
    private readonly secrets?: vscode.SecretStorage,
    private readonly workspaceState?: vscode.Memento,
    private readonly extensionContext?: vscode.ExtensionContext
  ) {
    this.extensionContext = extensionContext;
    this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());
    this.statusManager = new ChatStatusManager(mcpManager, secrets, (msg) => this.sendToWebview(msg));
    this.modelManager = new ChatModelManager((msg) => this.sendToWebview(msg));
    this.contextUsageDeps = {
      getOrCreateEngine: () => this.getEngine(),
      peekEngine: () => this.engine,
      getTabId: () => this.getEngine().getActiveTabId(),
      getTracker: () => this.contextUsageTracker,
      getFlags: () => this.countedFlags,
      getCompactor: () => this.sessionCompactor,
      sendToWebview: (msg) => this.sendToWebview(msg),
    };
    this.disposables.push(this.stateManager);
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
    // SA4E-369 round-6: the webview's full tab list (id + name) arrives with
    // every save — the production path that finally carries DISPLAY NAMES into
    // the peer registry (the ConversationManager binding is test-only).
    syncPeerTabNames(state.tabs as ReadonlyArray<{ id?: unknown; name?: unknown }>, this.workspaceRoot);
    // SA4E-182: Update context usage whenever chat state is saved (fires after every turn)
    runSavedStateContextUsage(this.contextUsageDeps, state);
  }

  sendContextUsage(tabId: string): void {
    const payload = this.contextUsageTracker.getUsagePayload(tabId);
    this.sendToWebview({ type: "chat:contextUsage", payload });
  }

  getContextUsageTracker(): ContextUsageTracker {
    return this.contextUsageTracker;
  }

  /** Get the id of the currently active tab for this provider view. */
  private getActiveTabId(): string {
    // Derive from the most recent saved state if available; otherwise "default"
    // ChatStateManager does not expose getState() — fallback to "default".
    return "default";
  }

  /** Subscribe to every engine message (sidebar stays the default sink). */
  onEngineMessage(listener: (msg: ChatExtToWebviewMessage) => void): vscode.Disposable {
    this.engineListeners.add(listener);
    return { dispose: () => { this.engineListeners.delete(listener); } };
  }

  dispose(): void {
    this.engine?.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  private routeMessage(msg: ChatWebviewToExtMessage): void {
    // SA4E-381 Issue 1 / SA4E-391 Issue 2: capture the REAL active tab id when a
    // user message starts a new turn — all subsequent stream/tool events in that
    // turn carry originTabId so the receiving tab attributes them correctly.
    // The webview stamps its activeTabId (a UUID) on the user message; a missing
    // tabId means a legacy/single-tab client, so fall back to undefined (the
    // webview then treats events as belonging to the viewed tab).
    if (msg.type === "chat:userMessage") {
      this.turnTabId = msg.tabId;
    }

    if (handleBuiltinChatMessage(msg, {
      saveChatState: (payload) => {
        this.stateManager.saveChatState(payload);
        // SA4E-369 round-6b: the REAL hot path — the webview's full tab list
        // (id + name) arrives with every save. The provider's saveChatState
        // wrapper is NOT on this path (routeMessage wires the state manager
        // directly), so the peer-name sync must live HERE.
        syncPeerTabNames(payload.tabs as ReadonlyArray<{ id?: unknown; name?: unknown }>, this.workspaceRoot);
      },
    })) { return; }
    if (msg.type === "ready") {
      void this.statusManager.sendCombinedStatus();
      void this.modelManager.sendModels();
      this.stateManager.restoreChatState();
      this.stateManager.sendSteeringInfo();
      this.stateManager.sendAgentsInfo();
      this.stateManager.sendSkillsInfo();
      void runInitialContextUsage(this.contextUsageDeps);
    }
    this.handleMessage(msg);
  }

  private onConfigChange(e: vscode.ConfigurationChangeEvent): void {
    applyChatConfigChange(e, {
      peekEngine: () => this.engine,
      getSecrets: () => this.secrets,
      sendModels: () => this.modelManager.sendModels(),
      sendCombinedStatus: () => this.statusManager.sendCombinedStatus(),
    });
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
    // SA4E-381 Issue 1: stamp originTabId on peer-capable protocol messages
    // so the receiving tab can attribute messages to the correct source tab.
    const protocolTypes = [
      "chat:streamChunk",
      "chat:streamComplete",
      "chat:toolCall",
      "chat:toolCallUpdate",
      "chat:toolApprovalPending",
      "chat:error"
    ];
    // SA4E-391 Bug 1 (cross-tab thinking leak): the ADAPTER stamps originTabId
    // at the source of every turn event (StreamHandler for stream events,
    // postToolLiveEvent for live tool events, the error emitters), pinned to the
    // tab that PRODUCED the turn. That stamp is authoritative — NEVER overwrite
    // it.
    //
    // The fallbacks below only serve LEGACY event paths that reach the host
    // without an origin. They are keyed by the event's OWN identity (streamId
    // for stream events, tool-call id for tool events) so a late event can
    // never be re-stamped with a DIFFERENT turn's tab — the bug that made one
    // tab's thinking block appear in another tab.
    if (protocolTypes.includes(msg.type)) {
      const typedMsg = msg as unknown as {
        originTabId?: string; streamId?: string; id?: string; toolCall?: { id?: string };
      };
      const streamId = typedMsg.streamId;
      const toolId = typedMsg.toolCall?.id ?? (msg.type === "chat:toolCallUpdate" ? typedMsg.id : undefined);
      if (!typedMsg.originTabId) {
        typedMsg.originTabId = this.resolveFallbackOrigin(streamId, toolId);
        msg = typedMsg as unknown as ChatExtToWebviewMessage;
      }
      // Remember the resolved origin under the event's own identity so the
      // matching follow-up event (toolCallUpdate) resolves to the SAME tab.
      if (streamId && typedMsg.originTabId) this.streamTurnTabId.set(streamId, typedMsg.originTabId);
      if (toolId && typedMsg.originTabId && msg.type === "chat:toolCall") {
        this.toolCallTabId.set(toolId, typedMsg.originTabId);
      }
      // Clean up the per-stream / per-tool maps once the event settles.
      if (msg.type === "chat:streamComplete" && streamId) this.streamTurnTabId.delete(streamId);
      if (msg.type === "chat:toolCallUpdate" && toolId) this.toolCallTabId.delete(toolId);
    }
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

  /**
   * Last-resort origin for an unstamped tab-scoped event (legacy paths only).
   * Prefers the event's own identity mapping (stream / tool call) over the
   * global "last submitting tab" hint, so a late event stays with its turn.
   */
  private resolveFallbackOrigin(streamId?: string, toolId?: string): string | undefined {
    const streamTabId = streamId ? this.streamTurnTabId.get(streamId) : undefined;
    if (streamTabId) return streamTabId;
    const toolTabId = toolId ? this.toolCallTabId.get(toolId) : undefined;
    if (toolTabId) return toolTabId;
    return this.turnTabId;
  }

  private getEngine(): PiWorkflowAdapter {
    if (!this.engine) {
      this.engine = createChatEngine(this.mcpManager, this.workspaceRoot, this.secrets, (msg) => this.sendToWebview(msg), this.engineListeners);
    }
    return this.engine;
  }

  private getMessageHandler(): MessageHandler {
    if (!this.messageHandler) {
      this.messageHandler = new MessageHandler(() => this.getEngine(), (msg) => this.sendToWebview(msg), this.workspaceRoot, (ct) => pickChatContext(this.workspaceRoot, (m) => this.sendToWebview(m), ct), () => pickAttachmentFiles((m) => this.sendToWebview(m)), (code, filePath) => applyCodeToEditor(code, filePath), (code) => insertCodeToEditor(code), (model) => setLlmModelConfig(model), () => this.updateContextUsageAfterTurn(), () => this.stateManager.broadcastInitialState());
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

  /**
   * SA4E-182: Update context token usage after each LLM turn (see context-compaction.ts).
   */
  private updateContextUsageAfterTurn(): void {
    runContextUsageAfterTurn(this.contextUsageDeps);
  }

  private getHtml(webview: vscode.Webview): string {
    const { ChatHtmlBuilder } = require("./ChatHtmlBuilder");
    return ChatHtmlBuilder.build(webview, this.extensionUri);
  }
}
