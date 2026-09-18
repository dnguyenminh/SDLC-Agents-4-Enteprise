/**
 * SA4E-85 — ChatWebviewProvider.
 * Manages the Svelte webview panel lifecycle with secure CSP nonce injection.
 * Uses crypto.randomBytes(16) for nonce generation per render.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { IMessageRouter } from '../router/IMessageRouter';
import { bindPiWorkflowEngineToPanel } from '../../pi-workflow/pi-workflow';

/**
 * Creates and manages the Svelte Chat Webview panel.
 * Injects CSP nonce to ensure only trusted scripts execute.
 */
export class ChatWebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly extensionUri: vscode.Uri;
  private readonly router: IMessageRouter;

  constructor(extensionUri: vscode.Uri, router: IMessageRouter) {
    this.extensionUri = extensionUri;
    this.router = router;
  }

  /** Show or create the chat webview panel */
  show(viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside): void {
    if (this.panel) {
      this.panel.reveal(viewColumn);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'sa4e85ChatPanel',
      'Agentic Chat',
      viewColumn,
      this.getWebviewOptions()
    );

    bindPiWorkflowEngineToPanel(this.panel);

    this.panel.webview.html = this.buildHtml(this.panel.webview);
    this.registerMessageListener();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.disposables);
  }

  /** Get the current webview panel (for external access) */
  getPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /** Generate a cryptographically secure nonce (16 bytes → 32 hex) */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /** Webview options with local resource roots restricted */
  private getWebviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
      ],
    };
  }

  /**
   * Build HTML with strict CSP. Nonce ensures only injected scripts run.
   * CSP: default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'
   */
  private buildHtml(webview: vscode.Webview): string {
    const nonce = this.generateNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'style.css')
    );

    return buildCspHtml({ nonce, scriptUri, styleUri });
  }

  /** Listen for messages from webview and dispatch through router */
  private registerMessageListener(): void {
    if (!this.panel) return;

    const listener = this.panel.webview.onDidReceiveMessage(
      (message) => this.router.dispatch(message),
      null,
      this.disposables
    );
    this.disposables.push(listener);
  }

  /** Dispose panel and all subscriptions */
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}

// --- HTML Builder (extracted for testability) ---

interface HtmlParams {
  nonce: string;
  scriptUri: vscode.Uri;
  styleUri: vscode.Uri;
}

/** Build strict CSP HTML shell for Svelte webview mount point */
function buildCspHtml({ nonce, scriptUri, styleUri }: HtmlParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src ${scriptUri.authority};">
  <link rel="stylesheet" nonce="${nonce}" href="${styleUri}">
  <title>Agentic Chat</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
