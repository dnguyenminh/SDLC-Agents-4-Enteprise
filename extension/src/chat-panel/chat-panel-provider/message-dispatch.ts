/**
 * ChatPanelProvider — built-in (non-LLM) webview message dispatch.
 * Extracted from ChatPanelProvider.routeMessage; dispatch order and
 * behavior are preserved exactly.
 */

import * as vscode from "vscode";
import { debugLog } from "../../debug-logger";
import { ChatWebviewToExtMessage } from "../message-protocol";

/** Collaborators the built-in message handling needs from ChatPanelProvider. */
export interface BuiltinMessageDeps {
  saveChatState: (payload: { tabs: unknown[]; activeTabId: string; messageHistory?: string[] }) => void;
}

/**
 * Handle the built-in message types (executeCommand / chat:saveState /
 * chat:debugLog). Returns true when the message was consumed.
 */
export function handleBuiltinChatMessage(msg: ChatWebviewToExtMessage, deps: BuiltinMessageDeps): boolean {
  if ((msg as any).type === "executeCommand" && (msg as any).command) {
    vscode.commands.executeCommand((msg as any).command);
    return true;
  }
  if (msg.type === "chat:saveState") {
    deps.saveChatState(msg.payload);
    return true;
  }
  if ((msg as any).type === "chat:debugLog") {
    debugLog(`[webview] ${(msg as any).text}`);
    return true;
  }
  return false;
}
