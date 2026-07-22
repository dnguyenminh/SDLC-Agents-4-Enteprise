/**
 * ChatStatusManager — handles combined MCP + LLM status checking
 * and notifies the webview of connection state changes.
 */

import * as vscode from "vscode";
import { createLlmProvider } from "../langgraph/providers";
import { IServerManager } from "../types/server-types";
import { mapServerStatusToWebview } from "../types";
import { ChatExtToWebviewMessage } from "./message-protocol";

export class ChatStatusManager {
  constructor(
    private readonly mcpManager: IServerManager,
    private readonly secrets?: vscode.SecretStorage,
    private readonly sendToWebview?: (msg: ChatExtToWebviewMessage) => void
  ) {}

  /**
   * Called by Settings panel when LLM test succeeds/fails.
   */
  notifyLlmStatusChanged(status: "connected" | "disconnected"): void {
    this.sendToWebview?.({ type: "serverStatus", status });
  }

  /**
   * Check both MCP server AND LLM provider availability.
   * Status = "connected" only when BOTH are working.
   */
  async sendCombinedStatus(): Promise<void> {
    const mcpStatus = this.mcpManager.status;
    const webviewStatus = mapServerStatusToWebview(mcpStatus);

    if (webviewStatus !== "connected") {
      this.sendToWebview?.({ type: "serverStatus", status: webviewStatus });
      return;
    }

    try {
      const provider = createLlmProvider(this.secrets);
      const llmAvailable = await provider.isAvailable();
      provider.dispose();
      const status = llmAvailable ? "connected" : "disconnected";
      this.sendToWebview?.({ type: "serverStatus", status });
    } catch (err) {
      console.debug(`[ChatStatusManager] LLM availability check failed (non-fatal): ${(err as Error).message}`);
      this.sendToWebview?.({ type: "serverStatus", status: "disconnected" });
    }
  }
}

