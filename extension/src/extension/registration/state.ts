/**
 * Shared runtime singletons for the extension activation pipeline.
 * Populated by the registration modules during activate()/initializeWorkspace()
 * and consumed by deactivate() — mirrors the module-level variables previously
 * held in extension.ts (BR-18 split; same lifetime and ordering semantics).
 */
import type { McpServerManager } from "../../mcp-server-manager";
import type { WebviewPanelManager } from "../../webview-panel-manager";
import type { ConfigWatcher } from "../../config-watcher";
import type { KbEventBus } from "../../kb-event-bus";
import type { KiroTreeViewProvider } from "../../sidebar/tree-view-provider";
import type { AuthManager } from "../../auth/AuthManager";
import type { StatusBarManager } from "../../ui/status-bar";
import type { SessionManager, ChatEngineAdapter } from "../../chat";
import type { ChatWebviewProvider } from "../../chat/webview/ChatWebviewProvider";
import type { DiffTracker } from "../../chat/diff/DiffTracker";
import type { SessionLifecycleEmitter } from "../../chat/engine/SessionLifecycleEmitter";

export interface ExtensionRuntime {
  mcpManager?: McpServerManager;
  panelManager?: WebviewPanelManager;
  configWatcher?: ConfigWatcher;
  kbEventBus?: KbEventBus;
  treeProvider?: KiroTreeViewProvider;
  authManager?: AuthManager;
  statusBarManager?: StatusBarManager;
  sessionManager?: SessionManager;
  chatEngineAdapter?: ChatEngineAdapter;
  agenticWebviewProvider?: ChatWebviewProvider;
  diffTracker?: DiffTracker;
  sessionLifecycle?: SessionLifecycleEmitter;
}

export const runtime: ExtensionRuntime = {};
