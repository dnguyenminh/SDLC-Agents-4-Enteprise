/**
 * LoginPanel — Webview for username/password login.
 * Opens as a tab when user clicks "Login" in sidebar.
 */

import * as vscode from "vscode";
import { AuthManager } from "../auth/AuthManager";
import type { SsoProviderInfo } from "../auth/SsoTypes";
import { getLoginPanelHtml } from "./login-panel-html";

export class LoginPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly authManager: AuthManager,
    private readonly extensionUri: vscode.Uri
  ) {}

  async show(): Promise<void> {
    if (this.panel) { this.panel.reveal(); return; }
    const lastUsername = await this.authManager.getLastUsername();
    // Render an SSO button for EVERY provider the backend reports as enabled
    // AND configured (GET /auth/sso/providers already filters enabled=1 with a
    // non-empty client_id). No provider is hardcoded — including Entra — so the
    // login screen always mirrors the backend's actual configuration.
    const providers = await this.authManager.listSsoProviders();
    this.panel = vscode.window.createWebviewPanel("sdlcAgents.login", "SDLC Agents 4 Enterprise — Login", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: false });
    this.panel.webview.html = this.getHtml(lastUsername, providers);
    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "login") { await this.handleLogin(msg.username, msg.password); }
      else if (msg.type === "sso") { await this.handleSso(msg.provider); }
    }, null, this.disposables);
    this.panel.onDidDispose(() => { this.panel = null; }, null, this.disposables);
  }

  close(): void { this.panel?.dispose(); this.panel = null; }

  private async handleLogin(username: string, password: string): Promise<void> {
    this.postMessage({ type: "loading", loading: true });
    try {
      await this.authManager.login(username, password);
      this.postMessage({ type: "success" });
      setTimeout(() => this.close(), 500);
    } catch (err) {
      this.postMessage({ type: "error", message: (err as Error).message });
    }
  }

  /**
   * Handle an SSO login for any provider (entra, google, github, …).
   * Surfaces failures to the user via the webview error banner — never
   * swallows the exception.
   */
  private async handleSso(provider: string): Promise<void> {
    this.postMessage({ type: "loading", loading: true });
    try {
      await this.authManager.loginSso(provider);
      this.postMessage({ type: "success" });
      setTimeout(() => this.close(), 500);
    } catch (err) {
      this.postMessage({ type: "error", message: (err as Error).message });
    }
  }

  private postMessage(msg: unknown): void { this.panel?.webview.postMessage(msg); }

  private getHtml(lastUsername: string = "", extraProviders: SsoProviderInfo[] = []): string {
    return getLoginPanelHtml(this.panel!.webview.cspSource, lastUsername, extraProviders);
  }

  dispose(): void { this.close(); this.disposables.forEach(d => d.dispose()); }
}
