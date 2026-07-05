/**
 * ChatHtmlBuilder — generates the HTML for the chat panel webview.
 * Extracted from ChatPanelProvider to keep the provider under 200 lines.
 */

import * as vscode from "vscode";
import { getNonce } from "../mcp-server-manager";

export class ChatHtmlBuilder {
  static build(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-assets", "chat", "chat.css"));
    const chatJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-assets", "chat", "chat.js"));
    const mdRendererUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-assets", "chat", "markdown-renderer.js"));
    const graphVizUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-assets", "chat", "graph-viz.js"));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none';">
    <link rel="stylesheet" href="${cssUri}">
    <title>Chat Panel</title>
</head>
<body>
    <div id="chat-root">
        ${ChatHtmlBuilder.headerHtml()}
        ${ChatHtmlBuilder.tabBarHtml()}
        ${ChatHtmlBuilder.steeringHtml()}
        ${ChatHtmlBuilder.warningsHtml()}
        ${ChatHtmlBuilder.welcomeHtml()}
        <div id="chat-messages" class="hidden"></div>
        ${ChatHtmlBuilder.inputAreaHtml()}
    </div>
    <script nonce="${nonce}" src="${mdRendererUri}"></script>
    <script nonce="${nonce}" src="${graphVizUri}"></script>
    <script nonce="${nonce}" src="${chatJsUri}"></script>
</body>
</html>`;
  }

  private static headerHtml(): string {
    return `<div id="chat-header"><div class="header-left"><div class="context-usage-icon" id="context-usage-icon" aria-label="Context window usage"><svg viewBox="0 0 20 20"><circle class="arc-bg" cx="10" cy="10" r="8" /><circle class="arc-progress safe" cx="10" cy="10" r="8" stroke-dasharray="50.27" stroke-dashoffset="50.27" transform="rotate(-90 10 10)" /></svg><span class="context-usage-tooltip" id="context-tooltip">0 / 128,000 tokens (0%)</span></div><span class="header-title">SDLC Pipeline</span></div><span id="status-indicator" class="status disconnected">disconnected</span></div>`;
  }

  private static tabBarHtml(): string {
    return `<div id="tab-bar" role="tablist" aria-label="Conversation tabs"><button class="tab-add-btn" id="tab-add-btn" title="New conversation (Ctrl+Shift+T)" aria-label="New tab">+</button></div>`;
  }

  private static steeringHtml(): string {
    return `<div class="steering-section" id="steering-section"><div class="steering-header" id="steering-header"><span class="steering-chevron">&#x25B6;</span><span>Included Rules</span><span id="steering-count">(0)</span></div><div class="steering-list" id="steering-list"></div></div>`;
  }

  private static warningsHtml(): string {
    return `<div class="context-full-warning" id="context-full-warning"><span>Context window is full.</span><span class="new-tab-link" id="full-new-tab">Start new tab</span></div><div class="context-toast" id="context-toast"><span id="toast-text">Context usage at 95%</span><button class="toast-dismiss" id="toast-dismiss">&times;</button></div><div id="working-bar"><span class="working-label"><span id="working-text">Working...</span></span><div class="working-actions"><button id="cancel-btn" title="Cancel">Cancel</button><button id="follow-btn" title="Follow output">Follow &#x1F441;</button></div></div>`;
  }

  private static welcomeHtml(): string {
    return `<div id="welcome-state"><h3>SDLC Pipeline Agent</h3><p>Ask a question or describe a task. Use ticket keys to trigger the full pipeline.</p><div class="welcome-suggestions"><button data-cmd="KSA-XXX tao BRD">&#x1F4CB; Create BRD from ticket</button><button data-cmd="KSA-XXX tao FSD">&#x1F4D0; Create FSD from ticket</button><button data-cmd="KSA-XXX tao tai lieu day du">&#x1F4DA; Full pipeline</button><button data-cmd="status">&#x1F4CA; Show pipeline status</button><button data-cmd="resume">&#x25B6; Resume paused pipeline</button><button data-action="openWorkflowGraph">&#x1F5FA; Open Workflow Graph</button></div></div>`;
  }

  private static inputAreaHtml(): string {
    return `<div id="chat-input-area"><div id="input-context-chips"></div><div class="input-wrapper"><div id="chat-input" contenteditable="true" role="textbox" aria-multiline="true" aria-placeholder="Ask a question or describe a task..."></div><div id="input-attachments"></div><div class="input-toolbar"><div class="input-toolbar-left"><button class="toolbar-btn" id="ctx-btn" title="Add context (#)">#</button><button class="toolbar-btn" id="attach-btn" title="Attach file">&#x1F4CE;</button><button class="toolbar-btn" id="stop-btn" title="Stop" style="display:none;">&#x23F9;</button></div><div class="input-toolbar-right"><button class="model-selector" id="model-btn"><span id="model-label">Auto</span><span class="model-chevron">&#x25BC;</span></button><div class="autopilot-toggle on" id="autopilot-toggle"><span class="toggle-label">Autopilot</span><div class="toggle-track"><div class="toggle-thumb"></div></div></div><button id="send-btn" title="Send">&#x2191;</button></div><div class="model-dropdown hidden" id="model-dropdown"><button data-model="auto" class="active">Auto</button></div><div class="context-menu hidden" id="context-menu"><button data-ctx="file"><span class="ctx-icon">&#x1F4C4;</span> Files</button><button data-ctx="spec"><span class="ctx-icon">&#x1F4CB;</span> Spec</button><button data-ctx="gitDiff"><span class="ctx-icon">&#x1F500;</span> Git Diff</button><button data-ctx="terminal"><span class="ctx-icon">&#x1F4BB;</span> Terminal</button><button data-ctx="problems"><span class="ctx-icon">&#x26A0;</span> Problems</button><button data-ctx="folder"><span class="ctx-icon">&#x1F4C1;</span> Folder</button><button data-ctx="currentFile"><span class="ctx-icon">&#x1F4DD;</span> Current File</button><button data-ctx="steering"><span class="ctx-icon">&#x1F9ED;</span> Steering</button><button data-ctx="mcp"><span class="ctx-icon">&#x1F50C;</span> MCP</button></div><div class="slash-popup hidden" id="slash-popup" role="listbox" aria-label="Slash commands"><div class="slash-section"><div class="slash-section-title">Agents</div><button type="button" class="slash-item" data-slash="/qa-agent" role="option"><span class="slash-icon">&#x1F9EA;</span><span class="slash-label">qa-agent</span><span class="slash-desc">QA Engineer</span></button><button type="button" class="slash-item" data-slash="/sa-agent" role="option"><span class="slash-icon">&#x1F3D7;</span><span class="slash-label">sa-agent</span><span class="slash-desc">Solution Architect</span></button><button type="button" class="slash-item" data-slash="/sm-agent" role="option"><span class="slash-icon">&#x1F4CB;</span><span class="slash-label">sm-agent</span><span class="slash-desc">Scrum Master</span></button><button type="button" class="slash-item" data-slash="/ta-agent" role="option"><span class="slash-icon">&#x1F527;</span><span class="slash-label">ta-agent</span><span class="slash-desc">Technical Architect</span></button><button type="button" class="slash-item" data-slash="/ui-agent" role="option"><span class="slash-icon">&#x1F3A8;</span><span class="slash-label">ui-agent</span><span class="slash-desc">UI/UX Designer</span></button><button type="button" class="slash-item" data-slash="/security-agent" role="option"><span class="slash-icon">&#x1F6E1;</span><span class="slash-label">security-agent</span><span class="slash-desc">Security Expert</span></button></div><div class="slash-section"><div class="slash-section-title">Steering Rules</div><div id="slash-steering-list"></div></div></div></div></div></div>`;
  }
}
