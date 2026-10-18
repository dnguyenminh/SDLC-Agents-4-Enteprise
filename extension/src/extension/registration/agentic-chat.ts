/**
 * Agentic Chat panel bootstrap (SA4E-85) — creates the
 * MessageRouter → PostMessageBridge → ChatWebviewProvider → ChatEngineAdapter
 * pipeline on first open and re-shows it afterwards.
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { ChatEngineAdapter, StreamProtocolAdapter } from "../../chat";
import { MessageRouter } from "../../chat/router/MessageRouter";
import { PostMessageBridge } from "../../chat/bridge/PostMessageBridge";
import { ChatWebviewProvider } from "../../chat/webview/ChatWebviewProvider";
import { IdeContextManager } from "../../chat/context/IdeContextManager";
import { OpenCodeToolHandler } from "../../chat/tools/OpenCodeToolHandler";
import { ChatPanelProvider } from "../../chat-panel/chat-panel-provider";
import { runtime } from "./state";

/**
 * SA4E-85: Open the new Agentic Chat panel.
 * Keeps old chat-panel working for backward compatibility.
 */
export function openAgenticChat(context: vscode.ExtensionContext, workspaceRoot: string, chatPanel: ChatPanelProvider): void {
  // Lazy-create the adapter and webview on first invocation
  if (!runtime.chatEngineAdapter) {
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

    createChatAdapter(context, chatPanel, workspaceRoot, {
      router, bridge, webviewProvider, streamAdapter, contextManager, toolHandler, engine,
    });

    // Already initialized — re-show (recreates the panel if the user closed it)
  } else {
    runtime.agenticWebviewProvider?.show(vscode.ViewColumn.Beside);
  }
}

/** Build the ChatEngineAdapter and wire bridge/router/panel fan-out. */
function createChatAdapter(
  context: vscode.ExtensionContext,
  chatPanel: ChatPanelProvider,
  workspaceRoot: string,
  parts: {
    router: MessageRouter;
    bridge: PostMessageBridge;
    webviewProvider: ChatWebviewProvider;
    streamAdapter: StreamProtocolAdapter;
    contextManager: IdeContextManager;
    toolHandler: OpenCodeToolHandler;
    // `any` preserves the pre-split semantics: the engine comes from
    // `(chatPanel as any).getEngine?.() ?? (chatPanel as any).engine`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine: any;
  },
): void {
  const { router, bridge, webviewProvider, streamAdapter, contextManager, toolHandler, engine } = parts;

  runtime.chatEngineAdapter = new ChatEngineAdapter({
    router,
    bridge,
    engine,
    streamAdapter,
    contextManager,
    toolHandler,
    sessionManager: runtime.sessionManager!,
    // SA4E-185 C-2 (B1): share the engine's approval gate so webview
    // TOOL_CALL_RESPONSE resolves the same gate the LangGraph chat path blocks on.
    approvalGate: (engine as any).approvalGate,
    // SA4E-183: DiffTracker for file change tracking
    diffTracker: runtime.diffTracker,
  });

  runtime.chatEngineAdapter.initialize();

  // Wire bridge to router (incoming webview messages)
  bridge.onMessage((msg) => router.dispatch(msg));

  // Fan-out engine responses into the Agentic panel (previously
  // handleEngineEvent had zero callers — the panel was send-only).
  const liveAdapter = runtime.chatEngineAdapter;
  const engineSub = chatPanel.onEngineMessage((msg) => liveAdapter.handleEngineEvent(msg));
  context.subscriptions.push({ dispose: () => engineSub.dispose() });

  // Show the webview panel
  runtime.agenticWebviewProvider = webviewProvider;
  webviewProvider.show(vscode.ViewColumn.Beside);

  // Wire the panel to the bridge after creation
  const panel = webviewProvider.getPanel();
  if (panel) {
    bridge.attachPanel(panel);
    router.setPanel(panel);
  }

  context.subscriptions.push(runtime.chatEngineAdapter);
  context.subscriptions.push({ dispose: () => router.dispose() });
  context.subscriptions.push({ dispose: () => bridge.dispose() });
  context.subscriptions.push(webviewProvider);
}
