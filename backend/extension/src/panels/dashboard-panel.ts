/**
 * DashboardPanel — KB Dashboard using MCP invokeTool for data.
 * mem_admin(dashboard) returns valid JSON: { metrics: {...}, recommendations: [...] }
 */

import * as vscode from "vscode";
import { WebviewToExtMessage, SERVER_CONSTANTS } from "../types";
import { McpServerManager } from "../mcp-server-manager";
import { BasePanel } from "./base-panel";

export class DashboardPanel extends BasePanel {
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(mcpManager: McpServerManager, extensionUri: vscode.Uri) {
    super("dashboard", mcpManager, extensionUri);
  }

  getHtml(webview: vscode.Webview): string {
    return this.getIframeHtml();
  }

  async loadData(): Promise<void> {
    // No-op: Data is loaded natively by the iframe
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    // No-op: Webview communication is handled inside the iframe
  }
}
