/**
 * LoginPanel — Webview for username/password login.
 * Opens as a tab when user clicks "Login" in sidebar.
 */

import * as vscode from "vscode";
import { getNonce } from "./base-panel";
import { AuthManager } from "../auth/AuthManager";

export class LoginPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly authManager: AuthManager,
    private readonly extensionUri: vscode.Uri
  ) {}

  show(): void {
    if (this.panel) { this.panel.reveal(); return; }
    this.panel = vscode.window.createWebviewPanel("kiroSdlc.login", "Kiro SDLC — Login", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: false });
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(async (msg) => { if (msg.type === "login") { await this.handleLogin(msg.username, msg.password); } }, null, this.disposables);
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

  private postMessage(msg: unknown): void { this.panel?.webview.postMessage(msg); }

  private getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    .btn { width: 100%; padding: 12px; font-size: 1em; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; font-weight: 500; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: var(--vscode-errorForeground); text-align: center; margin-top: 16px; font-size: 0.85em; display: none; }
    .success { color: var(--vscode-testing-iconPassed); text-align: center; margin-top: 16px; font-size: 0.9em; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Kiro SDLC Agents</h1>
    <p class="subtitle">Login to Backend Server</p>
    <form id="loginForm">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username" placeholder="admin" required />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password" required />
      </div>
      <button type="submit" class="btn btn-primary" id="loginBtn">Login</button>
    </form>
    <div class="error" id="errorMsg"></div>
    <div class="success" id="successMsg">Login successful</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('errorMsg');
    const successMsg = document.getElementById('successMsg');
    form.addEventListener('submit', (e) => { e.preventDefault(); const u = document.getElementById('username').value.trim(); const p = document.getElementById('password').value; if (!u || !p) return; errorMsg.style.display = 'none'; vscode.postMessage({ type: 'login', username: u, password: p }); });
    window.addEventListener('message', (event) => { const msg = event.data; if (msg.type === 'loading') { loginBtn.disabled = msg.loading; loginBtn.textContent = msg.loading ? 'Logging in...' : 'Login'; } else if (msg.type === 'error') { errorMsg.style.display = 'block'; errorMsg.textContent = msg.message; loginBtn.disabled = false; loginBtn.textContent = 'Login'; } else if (msg.type === 'success') { successMsg.style.display = 'block'; errorMsg.style.display = 'none'; loginBtn.disabled = true; loginBtn.textContent = 'Done'; } });
    document.getElementById('username').focus();
  </script>
</body>
</html>`;
  }

  dispose(): void { this.close(); this.disposables.forEach(d => d.dispose()); }
}
