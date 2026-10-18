/**
 * ChatPanelProvider — PiWorkflowAdapter construction (lazy engine factory).
 * Extracted from ChatPanelProvider.getEngine; the adapter configuration,
 * event fan-out behavior and comments are preserved exactly.
 */

import * as vscode from "vscode";
import { PiWorkflowAdapter, KbRemoteCheckpointerStore } from "../../pi-workflow";
import { createLlmProvider } from "../../mcp/providers";
import { ChatExtToWebviewMessage } from "../message-protocol";
import type { IServerManager } from "../../types/server-types";

export function createChatEngine(
  mcpManager: IServerManager,
  workspaceRoot: string,
  secrets: vscode.SecretStorage | undefined,
  sendToWebview: (msg: ChatExtToWebviewMessage) => void,
  /**
   * Fan-out subscribers for engine messages (streaming-identity fix).
   * The sidebar consumes via sendToWebview; the Agentic Chat panel
   * subscribes here so engine responses actually reach it (previously
   * handleEngineEvent had zero callers — send-only dead panel).
   */
  engineListeners: Set<(msg: ChatExtToWebviewMessage) => void>,
): PiWorkflowAdapter {
  return new PiWorkflowAdapter({
    mcpManager,
    workspaceRoot,
    onEvent: (msg: ChatExtToWebviewMessage) => {
      sendToWebview(msg);
      for (const listener of engineListeners) {
        try {
          listener(msg);
        } catch {
          // One bad subscriber must not break the sidebar.
        }
      }
    },
    llmProvider: secrets ? createLlmProvider(secrets) : undefined,
    checkpointerStore: new KbRemoteCheckpointerStore({
      workspaceRoot,
    }),
    secrets,
  });
}
