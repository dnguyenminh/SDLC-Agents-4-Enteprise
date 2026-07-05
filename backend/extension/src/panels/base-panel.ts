/**
 * BasePanel --- Abstract base class for all KB webview panels.
 * Provides common lifecycle management, message handling, and server status subscription.
 */

import * as vscode from "vscode";
import {
  IKbPanel, ExtToWebviewMessage, WebviewToExtMessage,
  PanelType, PANEL_VIEW_TYPES, PANEL_TITLES, mapServerStatusToWebview,
} from "../types";
import { McpServerManager, getNonce } from "../mcp-server-manager";
import { getIframeHtml, getBaseHtml } from "./panel-html";
export { getNonce };

export abstract class BasePanel implements IKbPanel, vscode.Disposable {
  public static authTokenProvider?: () => string;
  protected _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _onDisposeEmitter = new vscode.EventEmitter<void>();

  constructor(
    protected readonly panelType: PanelType,
    protected readonly mcpManager: McpServerManager,
    protected readonly extensionUri: vscode.Uri
  ) { this.create(); }

  get viewType(): string { return PANEL_VIEW_TYPES[this.panelType]; }
  get panel(): vscode.WebviewPanel { return this._panel!; }
  get isAlive(): boolean { return this._panel !== undefined; }

  onDispose(callback: () => void): void { this._onDisposeEmitter.event(callback); }

  protected create(column: vscode.ViewColumn = vscode.ViewColumn.One): void {
    this._panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPES[this.panelType], PANEL_TITLES[this.panelType], column,
      {
        enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "webview-assets"),
          vscode.Uri.joinPath(this.extensionUri, "out"),
        ],
      }
    );
    this._panel.webview.html = this.getHtml(this._panel.webview);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtMessage | { type: 'auth_error' }) => {
        if (msg.type === 'auth_error') {
          vscode.commands.executeCommand('kiroSdlc.refreshToken').then(() => {
            if (this._panel) { this._panel.webview.html = this.getHtml(this._panel.webview); }
          });
          return;
        }
        this.handleMessage(msg as WebviewToExtMessage);
      }, undefined, this._disposables
    );
    this._panel.onDidDispose(() => {
      this._panel = undefined;
      this._onDisposeEmitter.fire();
      this.disposeInternal();
    }, null, this._disposables);
    this.mcpManager.onStatusChange((status) => {
      this.sendMessage({ type: "serverStatus", status: mapServerStatusToWebview(status) });
    }, null, this._disposables);
  }

  reveal(): void { this._panel?.reveal(); }
  reload(): void { if (this._panel) { this._panel.webview.html = this.getHtml(this._panel.webview); } }
  sendMessage(msg: ExtToWebviewMessage): void { if (this._panel) { this._panel.webview.postMessage(msg); } }
  dispose(): void { this._panel?.dispose(); }

  private disposeInternal(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
    this._onDisposeEmitter.dispose();
  }

  protected getNonce(): string { return getNonce(); }

  protected getWebviewUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...pathSegments));
  }

  protected getIframeHtml(): string {
    return getIframeHtml(this.panelType, BasePanel.authTokenProvider);
  }

  protected getBaseHtml(webview: vscode.Webview, bodyContent: string, scripts: string[], styles: string[]): string {
    return getBaseHtml(webview, this.panelType, this.extensionUri, bodyContent, scripts, styles, this.getNonce());
  }

  // === Abstract methods ===
  abstract getHtml(webview: vscode.Webview): string;
  abstract loadData(): Promise<void>;
  abstract handleMessage(msg: WebviewToExtMessage): Promise<void>;
}
