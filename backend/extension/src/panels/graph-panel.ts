/**
 * GraphPanel — KB Graph viewer via iframe (shared viewer on MCP port).
 * Uses same viewer as browser (http://localhost:PORT/) for consistent results.
 */

import * as vscode from "vscode";
import { WebviewToExtMessage } from "../types";
import { McpServerManager } from "../mcp-server-manager";
import { BasePanel } from "./base-panel";

export class GraphPanel extends BasePanel {
  constructor(mcpManager: McpServerManager, extensionUri: vscode.Uri) {
    super("graph", mcpManager, extensionUri);
  }

  getHtml(webview: vscode.Webview): string {
    return this.getIframeHtml();
  }

  async loadData(): Promise<void> {
    // No-op: iframe loads data directly from MCP server API
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    // No-op: iframe handles all interactions internally
  }
}
