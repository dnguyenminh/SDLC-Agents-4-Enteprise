/**
 * BasePanel HTML generation --- extracted templates for iframe and base HTML.
 */

import * as vscode from "vscode";
import { PanelType, PANEL_TITLES } from "../types";
import { BasePanel } from "./base-panel";

/**
 * Generates an iframe that embeds the backend server's UI.
 */
export function getIframeHtml(panelType: PanelType, authTokenProvider?: () => string): string {
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const backendUrl = config.get<string>("backend.url") || "http://127.0.0.1:48721";
  const token = authTokenProvider ? authTokenProvider() : "";
  const encodedToken = encodeURIComponent(token);
  const pageMapping: Record<string, string> = {
    dashboard: "dashboard", graph: "graph", tags: "tags",
    quality: "quality", analytics: "analytics", workflow: "workflow",
  };
  const page = pageMapping[panelType] || "dashboard";
  const backendOrigin = new URL(backendUrl).origin;
  const src = `${backendUrl}/admin?embed=true&page=${page}&token=${encodedToken}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${backendOrigin}; style-src 'unsafe-inline';">
    <title>${PANEL_TITLES[panelType]}</title>
    <style>
      body { padding: 0; margin: 0; height: 100vh; width: 100vw; overflow: hidden; background-color: var(--vscode-editor-background); }
      iframe { border: none; width: 100%; height: 100%; display: block; }
    </style>
</head>
<body>
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--vscode-descriptionForeground); text-align: center; z-index: -1;">
        <p>Loading Dashboard UI from backend...</p>
        <p style="font-size: 0.8em; opacity: 0.7;">If this message persists, the backend server may be down.</p>
    </div>
    <iframe src="${src}" allow="clipboard-read; clipboard-write"></iframe>
    <script>
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', (event) => {
        if (event.data && (event.data.type === 'auth_error' || event.data.status === 401)) {
          vscode.postMessage({ type: 'auth_error' });
        }
      });
    </script>
</body>
</html>`;
}

/**
 * Generate the base HTML wrapper with CSP headers.
 */
export function getBaseHtml(
  webview: vscode.Webview,
  panelType: PanelType,
  extensionUri: vscode.Uri,
  bodyContent: string,
  scripts: string[],
  styles: string[],
  nonce: string
): string {
  const cspSource = webview.cspSource;
  const getUri = (...segs: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...segs));

  const styleLinks = styles
    .map((s) => `<link rel="stylesheet" href="${getUri("webview-assets", s)}">`)
    .join("\n    ");
  const scriptTags = scripts
    .map((s) => `<script nonce="${nonce}" src="${getUri("webview-assets", s)}"></script>`)
    .join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none';">
    <title>${PANEL_TITLES[panelType]}</title>
    ${styleLinks}
    <style>
      body { padding: 0; margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
      .loading { display: flex; align-items: center; justify-content: center; height: 100vh; opacity: 0.7; }
      .error-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 9999; }
      .error-overlay.visible { display: flex; }
      .error-box { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 20px; text-align: center; max-width: 400px; }
      .error-box button { margin-top: 12px; padding: 6px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="error-overlay" class="error-overlay">
      <div class="error-box">
        <p id="error-message">Server disconnected. Reconnecting...</p>
        <button id="retry-btn" onclick="handleRetry()" style="display:none">Retry</button>
      </div>
    </div>
    ${bodyContent}
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'serverStatus') {
          const overlay = document.getElementById('error-overlay');
          const errorMsg = document.getElementById('error-message');
          const retryBtn = document.getElementById('retry-btn');
          if (msg.status === 'connected') { overlay.classList.remove('visible'); vscode.postMessage({ type: 'refresh' }); }
          else if (msg.status === 'disconnected') { errorMsg.textContent = 'Server disconnected. Reconnecting...'; retryBtn.style.display = 'none'; overlay.classList.add('visible'); }
          else if (msg.status === 'failed') { errorMsg.textContent = 'Server unavailable. Click to retry.'; retryBtn.style.display = 'inline-block'; overlay.classList.add('visible'); }
        }
        if (msg.type === 'error') { const o = document.getElementById('error-overlay'); document.getElementById('error-message').textContent = msg.message; document.getElementById('retry-btn').style.display = msg.retryable ? 'inline-block' : 'none'; o.classList.add('visible'); }
        if (typeof handlePanelMessage === 'function') { handlePanelMessage(msg); }
      });
      function handleRetry() { document.getElementById('error-overlay').classList.remove('visible'); vscode.postMessage({ type: 'manualRetry' }); }
      vscode.postMessage({ type: 'ready' });
    </script>
    ${scriptTags}
</body>
</html>`;
}
