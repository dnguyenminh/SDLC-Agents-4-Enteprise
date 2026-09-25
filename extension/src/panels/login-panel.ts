/**
 * LoginPanel — Webview for username/password login.
 * Opens as a tab when user clicks "Login" in sidebar.
 */

import * as vscode from "vscode";
import { getNonce } from "./base-panel";
import { AuthManager } from "../auth/AuthManager";
import type { SsoProviderInfo } from "../auth/SsoTypes";

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
    this.panel = vscode.window.createWebviewPanel("kiroSdlc.login", "SDLC Agents 4 Enterprise — Login", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: false });
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

  /**
   * Build the dynamic SSO button markup for every enabled provider.
   * The provider_type drives the click handler (data-provider) and a brand
   * CSS class. The visible label uses a friendly brand name for well-known
   * providers (entra→Microsoft) and otherwise the admin-supplied provider name.
   */
  private renderSsoButtons(providers: SsoProviderInfo[]): string {
    return providers.map((p) => {
      const type = escapeHtml(p.provider_type);
      const label = escapeHtml(`Sign in with ${brandLabel(p)}`);
      const brand = `sso-${p.provider_type.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      return `<button type="button" class="btn btn-secondary sso-btn ${brand}" data-provider="${type}">${label}</button>`;
    }).join("\n    ");
  }

  private getHtml(lastUsername: string = "", extraProviders: SsoProviderInfo[] = []): string {
    const nonce = getNonce();
    const cspSource = this.panel!.webview.cspSource;
    const ssoButtons = this.renderSsoButtons(extraProviders);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${cspSource} data:;">
  <title>Login</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 0; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .container { width: 100%; max-width: 360px; padding: 40px 20px; }
    h1 { font-size: 1.5em; text-align: center; margin-bottom: 8px; }
    .subtitle { text-align: center; opacity: 0.7; margin-bottom: 32px; font-size: 0.9em; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 4px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 1em; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; outline: none; }
    input:focus { border-color: var(--vscode-focusBorder); }
    .password-wrapper { position: relative; display: flex; align-items: center; }
    .password-wrapper input { padding-right: 40px; }
    .toggle-password { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: var(--vscode-icon-foreground, #aaa); font-size: 1.1em; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 3px; outline: none; user-select: none; }
    .toggle-password:hover { color: var(--vscode-foreground); }
    .btn { width: 100%; padding: 12px; font-size: 1em; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; font-weight: 500; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); border: 1px solid var(--vscode-button-border, var(--vscode-input-border)); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .sso-btn { display: flex; align-items: center; justify-content: center; gap: 8px; }
    .error { color: var(--vscode-errorForeground); text-align: center; margin-top: 16px; font-size: 0.85em; display: none; }
    .success { color: var(--vscode-testing-iconPassed); text-align: center; margin-top: 16px; font-size: 0.9em; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SDLC Agents 4 Enterprise</h1>
    <p class="subtitle">Login to Backend Server</p>
    <form id="loginForm">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username" placeholder="admin" value="${lastUsername}" required />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <div class="password-wrapper">
          <input type="password" id="password" autocomplete="current-password" required />
          <button type="button" class="toggle-password" id="togglePassword" title="Show/Hide Password" tabindex="-1">👁️</button>
        </div>
      </div>
      <button type="submit" class="btn btn-primary" id="loginBtn">Login</button>
    </form>
    ${ssoButtons}
    <div class="error" id="errorMsg"></div>
    <div class="success" id="successMsg">Login successful</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const ssoBtns = Array.from(document.querySelectorAll('.sso-btn'));
    const errorMsg = document.getElementById('errorMsg');
    const successMsg = document.getElementById('successMsg');
    const pwdInput = document.getElementById('password');
    const toggleBtn = document.getElementById('togglePassword');

    toggleBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      toggleBtn.textContent = isPwd ? '🙈' : '👁️';
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value.trim();
      const p = pwdInput.value;
      if (!u || !p) return;
      errorMsg.style.display = 'none';
      vscode.postMessage({ type: 'login', username: u, password: p });
    });

    ssoBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        errorMsg.style.display = 'none';
        vscode.postMessage({ type: 'sso', provider: btn.getAttribute('data-provider') });
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'loading') {
        loginBtn.disabled = msg.loading;
        ssoBtns.forEach((b) => { b.disabled = msg.loading; });
        loginBtn.textContent = msg.loading ? 'Logging in...' : 'Login';
      } else if (msg.type === 'error') {
        errorMsg.style.display = 'block';
        errorMsg.textContent = msg.message;
        loginBtn.disabled = false;
        ssoBtns.forEach((b) => { b.disabled = false; });
        loginBtn.textContent = 'Login';
      } else if (msg.type === 'success') {
        successMsg.style.display = 'block';
        errorMsg.style.display = 'none';
        loginBtn.disabled = true;
        ssoBtns.forEach((b) => { b.disabled = true; });
        loginBtn.textContent = 'Done';
      }
    });

    const usernameInput = document.getElementById('username');
    if (usernameInput.value) {
      pwdInput.focus();
    } else {
      usernameInput.focus();
    }
  </script>
</body>
</html>`;
  }

  dispose(): void { this.close(); this.disposables.forEach(d => d.dispose()); }
}

/**
 * Friendly brand label for a provider button. Well-known provider types get a
 * recognizable brand name (e.g. Entra shows "Microsoft"); everything else falls
 * back to the admin-configured display name, then the raw provider type.
 */
function brandLabel(p: SsoProviderInfo): string {
  const known: Record<string, string> = {
    entra: "Microsoft",
    azuread: "Microsoft",
    google: "Google",
    github: "GitHub",
    facebook: "Facebook",
    x: "X",
  };
  return known[p.provider_type.toLowerCase()] || p.name || p.provider_type;
}

/**
 * Escape a string for safe interpolation into HTML attributes/text,
 * preventing markup injection from provider names supplied via the backend.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
