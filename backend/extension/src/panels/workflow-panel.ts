/**
 * WorkflowPanel — Interactive D3.js + dagre visualization of the SDLC pipeline graph.
 * Renders all LangGraph nodes, edges, and conditional routing in a VS Code webview.
 * KSA-238
 */

import * as vscode from "vscode";
import { WebviewToExtMessage } from "../types";
import { McpServerManager } from "../mcp-server-manager";
import { BasePanel } from "./base-panel";
import { SDLC_GRAPH_DEFINITION } from "../langgraph/workflow-graph-data";

export class WorkflowPanel extends BasePanel {
  constructor(mcpManager: McpServerManager, extensionUri: vscode.Uri) {
    super("workflow", mcpManager, extensionUri);
  }

  getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const cspSource = webview.cspSource;
    const threeUri = this.getWebviewUri(webview, "webview-assets", "three.min.js");
    const forceGraphUri = this.getWebviewUri(webview, "webview-assets", "3d-force-graph.min.js");
    const cssUri = this.getWebviewUri(webview, "webview-assets", "workflow-graph.css");
    const jsUri = this.getWebviewUri(webview, "webview-assets", "workflow-graph.js");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data: blob:; connect-src 'none';">
    <title>SDLC Workflow Graph</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <div id="toolbar">
      <button id="refresh-btn" title="Refresh">&#x21BB; Refresh</button>
    </div>
    <div id="phase-bar"></div>
    <div id="graph-3d"></div>
    <div id="node-info" class="hidden"></div>
    <div id="graph-container" style="display:none"></div>
    <div id="path-section" class="hidden" style="display:none"><div id="path-header"><span id="path-title"></span><button id="path-close"></button></div><div id="path-graph"></div></div>
    <div id="node-detail" class="hidden" style="display:none"><div id="detail-header"><span id="detail-title"></span><button id="detail-close"></button></div><div id="detail-body"></div></div>

    <script nonce="${nonce}" src="${threeUri}"></script>
    <script nonce="${nonce}" src="${forceGraphUri}"></script>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (typeof handlePanelMessage === 'function') handlePanelMessage(msg);
      });
      vscode.postMessage({ type: 'ready' });
    </script>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  async loadData(): Promise<void> {
    this.sendMessage({
      type: "workflowData",
      nodes: SDLC_GRAPH_DEFINITION.nodes,
      edges: SDLC_GRAPH_DEFINITION.edges,
      metadata: SDLC_GRAPH_DEFINITION.metadata,
    } as any);
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this.loadData();
        break;
      case "refresh":
        await this.loadData();
        break;
    }
  }
}
