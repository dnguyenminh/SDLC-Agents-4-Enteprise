/**
 * ChatPanelProvider — KSA-210
 * WebviewViewProvider for the Chat Panel sidebar.
 * Delegates status, models, state to extracted managers.
 */

import * as vscode from "vscode";
import { debugLog } from "../debug-logger";
import { McpServerManager } from "../mcp-server-manager";
import { LangGraphEngine } from "../langgraph/langgraph-engine";
import { createLlmProvider } from "../langgraph/providers";
import { MessageHandler } from "./message-handler";
import { ChatWebviewToExtMessage, ChatExtToWebviewMessage } from "./message-protocol";
import { ContextUsageTracker } from "./context-usage-tracker";
import { ChatStatusManager } from "./ChatStatusManager";
import { ChatModelManager } from "./ChatModelManager";
import { ChatStateManager } from "./ChatStateManager";

export class ChatPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "kiroChatPanel";

  private view: vscode.WebviewView | undefined;
  private engine: LangGraphEngine | null = null;
  private messageHandler: MessageHandler | null = null;
  private messageBuffer: ChatExtToWebviewMessage[] = [];
  private contextUsageTracker: ContextUsageTracker = new ContextUsageTracker();
  private disposables: vscode.Disposable[] = [];

  private readonly statusManager: ChatStatusManager;
  private readonly modelManager: ChatModelManager;
  private readonly stateManager: ChatStateManager;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly mcpManager: McpServerManager,
    private readonly workspaceRoot: string,
    private readonly secrets?: vscode.SecretStorage,
    private readonly workspaceState?: vscode.Memento
  ) {
    this.statusManager = new ChatStatusManager(mcpManager, secrets, (msg) => this.sendToWebview(msg));
    this.modelManager = new ChatModelManager((msg) => this.sendToWebview(msg));
    this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());
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
  }

  sendContextUsage(tabId: string): void {
    const payload = this.contextUsageTracker.getUsagePayload(tabId);
    this.sendToWebview({ type: "chat:contextUsage", payload });
  }

  getContextUsageTracker(): ContextUsageTracker {
    return this.contextUsageTracker;
  }

  dispose(): void {
    this.engine?.dispose();
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

  private getEngine(): LangGraphEngine {
    if (!this.engine) {
      this.engine = new LangGraphEngine(this.mcpManager, this.workspaceRoot, (msg) => this.sendToWebview(msg), this.secrets ? createLlmProvider(this.secrets) : undefined);
    }
    return this.engine;
  }

  private getMessageHandler(): MessageHandler {
    if (!this.messageHandler) {
      this.messageHandler = new MessageHandler(() => this.getEngine(), (msg) => this.sendToWebview(msg), (ct) => this.handlePickContext(ct), () => this.handlePickAttachment(), (code, filePath) => this.handleApplyCode(code, filePath), (code) => this.handleInsertCode(code), (model) => this.handleSetModel(model));
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
    } catch { /* Non-fatal */ }
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
      } catch {
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
