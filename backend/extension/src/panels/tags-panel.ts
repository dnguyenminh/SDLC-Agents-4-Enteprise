/**
 * TagsPanel — Tag cloud and taxonomy tree with CRUD operations.
 * Real-time updates via KbEventBus SSE subscription + polling fallback.
 */

import * as vscode from "vscode";
import { WebviewToExtMessage, SERVER_CONSTANTS } from "../types";
import { McpServerManager } from "../mcp-server-manager";
import { BasePanel } from "./base-panel";
import { KbEventBus } from "../kb-event-bus";

export class TagsPanel extends BasePanel {
  private refreshTimer: NodeJS.Timeout | undefined;
  private eventSubscription: vscode.Disposable | undefined;

  constructor(mcpManager: McpServerManager, extensionUri: vscode.Uri, eventBus?: KbEventBus) {
    super("tags", mcpManager, extensionUri);
  }

  getHtml(webview: vscode.Webview): string {
    return this.getIframeHtml();
  }

  async loadData(): Promise<void> {
    // No-op
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    // No-op
  }
}
