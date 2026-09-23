/**
 * SettingsPanel — WebviewPanel creation and message routing.
 * Thin shell that delegates business logic to SettingsMessageHandler.
 */

import * as vscode from "vscode";
import { getNonce } from "../../mcp-server-manager";
import { SettingsMessageHandler } from "./SettingsMessageHandler";
import { getProvidersByCategory } from "../../langgraph/providers/provider-registry";

export class SettingsPanel {
  public static readonly viewType = "kiroSettingsPanel";
  public static instance: SettingsPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly messageHandler: SettingsMessageHandler;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: vscode.SecretStorage
  ) {
    this.panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      "SDLC Pipeline Settings",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "webview-assets"),
        ],
      }
    );

    this.panel.iconPath = new vscode.ThemeIcon("gear");
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.messageHandler = new SettingsMessageHandler(
      this.secrets,
      (msg) => this.panel.webview.postMessage(msg)
    );

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.messageHandler.handle(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(
      () => {
        SettingsPanel.instance = undefined;
        this.disposeInternal();
      },
      null,
      this.disposables
    );
  }

  /** Open or reveal the settings panel (singleton). */
  public static open(extensionUri: vscode.Uri, secrets: vscode.SecretStorage): void {
    if (SettingsPanel.instance) {
      SettingsPanel.instance.panel.reveal();
      return;
    }
    SettingsPanel.instance = new SettingsPanel(extensionUri, secrets);
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private disposeInternal(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  private buildProviderOptions(): string {
    const byCategory = getProvidersByCategory();
    const labels: Record<string, string> = { cloud: "☁️ Cloud", enterprise: "🏢 Enterprise", gateway: "🔀 Gateways", local: "💻 Local" };
    let html = "";
    for (const cat of ["cloud", "enterprise", "gateway", "local"] as const) {
      const providers = byCategory[cat];
      if (providers.length === 0) { continue; }
      html += `<optgroup label="${labels[cat]}">`;
      for (const p of providers) { html += `<option value="${p.id}">${p.label}</option>`; }
      html += `</optgroup>`;
    }
    return html;
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-assets", "settings", "settings.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-assets", "settings", "settings.js")
    );
    const proxyJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-assets", "settings", "proxy-tab.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none';">
    <link rel="stylesheet" href="${cssUri}">
    <title>SDLC Pipeline Settings</title>
</head>
<body>
    <div id="settings-root">
        <header class="settings-header">
            <h1>&#9881; SDLC Pipeline Settings</h1>
            <p class="subtitle">Configure LLM provider and server connections</p>
        </header>
        <div class="tab-bar" role="tablist">
            <button class="tab-btn active" id="tab-llm" data-tab="pane-llm" role="tab" aria-selected="true">&#129302; LLM Provider</button>
            <button class="tab-btn" id="tab-server" data-tab="pane-server" role="tab" aria-selected="false">&#127760; Server Settings</button>
            <button class="tab-btn" id="tab-proxy" data-tab="pane-proxy" role="tab" aria-selected="false">&#128274; Proxy</button>
        </div>
        <div class="tab-pane active" id="pane-llm" role="tabpanel">
            <section class="card" id="provider-section"><h2>&#129302; LLM Provider</h2><div class="provider-select-group"><label for="provider-select">Choose provider</label><select id="provider-select">${this.buildProviderOptions()}</select></div></section>
            <section class="card" id="api-section" style="display:none;"><h2>&#128273; API Configuration</h2><div class="form-group"><label for="api-key-input">API Key</label><div class="input-with-toggle"><input type="password" id="api-key-input" placeholder="Enter API key..." autocomplete="off"><button class="icon-btn" id="toggle-key-visibility" title="Show/Hide" aria-label="Toggle API key visibility">&#128065;</button></div><div id="key-status" class="status-indicator"></div></div><div class="form-group"><label for="base-url-input">Base URL <span style="opacity:0.6">(optional)</span></label><div class="checkbox-group" style="margin-bottom:6px;"><label><input type="checkbox" id="use-default-url-chk" checked> Use default URL for this provider</label></div><input type="text" id="base-url-input" placeholder="Leave empty for official API" disabled></div><div class="form-group"><label for="model-input">Model</label><input type="text" id="model-input" list="model-datalist" autocomplete="off" placeholder="Chọn hoặc gõ model id (vd: free-tier-models, auto/best-free)"><datalist id="model-datalist"></datalist><div class="field-hint" id="model-description-info"></div></div><div class="btn-row"><button id="save-key-btn" class="btn primary" disabled>Save API Key</button><button id="clear-key-btn" class="btn danger-outline">Clear Key</button></div></section>
            <section class="card" id="ollama-section" style="display:none;"><h2>&#129433; Ollama Configuration</h2><div class="form-group"><label for="ollama-url-input">Server URL</label><input type="text" id="ollama-url-input" value="http://localhost:11434"></div><div class="form-group"><label for="ollama-model-input">Model</label><select id="ollama-model-input"><option value="">— Select model —</option></select></div><div class="btn-row"><button id="test-ollama-btn" class="btn secondary">Test Connection</button></div><div id="ollama-status" class="status-indicator"></div></section>
            <section class="card" id="test-section"><h2>&#129514; Connection Test</h2><p class="card-desc">Send a test prompt to verify your LLM configuration works end-to-end.</p><div class="btn-row"><button id="test-llm-btn" class="btn primary">Test LLM</button></div><div id="test-result" class="test-result" style="display:none;"></div></section>
        </div>
        <div class="tab-pane" id="pane-server" role="tabpanel">
            <section class="card" id="pega-config-section"><h2>&#127970; Pega Platform Connection</h2><p class="card-desc">Configure Pega REST API credentials for rule indexing.</p><div class="form-group"><label for="pega-endpoint-input">Pega Endpoint URL</label><input type="text" id="pega-endpoint-input" placeholder="http://localhost:8080/prweb"></div><div class="form-group"><label for="pega-username-input">Operator ID (Username)</label><input type="text" id="pega-username-input" placeholder="admin@jira"></div><div class="form-group"><label for="pega-password-input">Password / Token</label><div class="input-with-toggle"><input type="password" id="pega-password-input" placeholder="Enter Pega password..." autocomplete="off"><button class="icon-btn" id="toggle-pega-password-visibility" title="Show/Hide" aria-label="Toggle Pega password visibility">&#128065;</button></div></div><div class="btn-row"><button id="save-pega-btn" class="btn primary">Save Pega Config</button><button id="test-pega-btn" class="btn secondary">Test Connection</button><button id="fetch-pega-btn" class="btn secondary">Fetch Pega Context</button></div><div id="pega-test-result" class="status-indicator"></div></section>
            <section class="card" id="atlassian-config-section"><h2>&#128279; Atlassian Connection</h2><p class="card-desc">Configure Jira/Confluence credentials for the Atlassian MCP server.</p><div class="form-group"><label for="atlassian-url-input">Jira Base URL</label><input type="text" id="atlassian-url-input" placeholder="https://company.atlassian.net"></div><div class="form-group"><label for="atlassian-email-input">Email</label><input type="text" id="atlassian-email-input" placeholder="user@company.com"></div><div class="form-group"><label for="atlassian-token-input">API Token / PAT</label><div class="input-with-toggle"><input type="password" id="atlassian-token-input" placeholder="Enter API token..." autocomplete="off"><button class="icon-btn" id="toggle-atlassian-token-visibility" title="Show/Hide" aria-label="Toggle token visibility">&#128065;</button></div></div><div class="form-group"><label>Connection Type</label><div class="radio-group"><label class="radio-label"><input type="radio" name="atlassian-type" value="cloud" checked> Cloud (email + API token)</label><label class="radio-label"><input type="radio" name="atlassian-type" value="server"> Server/DC (username + PAT)</label></div></div><div class="btn-row"><button id="save-atlassian-btn" class="btn primary">Save</button><button id="test-atlassian-btn" class="btn secondary">Test Connection</button></div><div id="atlassian-test-result" class="status-indicator"></div></section>
            <section class="card" id="backend-mcp-section"><h2>&#127760; Backend MCP Server</h2><p class="card-desc">Configure the remote backend server URL.</p><div class="form-group"><label for="backend-url-input">Backend URL</label><input type="text" id="backend-url-input" placeholder="http://127.0.0.1:48721"></div><div class="form-group checkbox-group"><label for="allow-insecure-remote-chk"><input type="checkbox" id="allow-insecure-remote-chk" aria-describedby="allow-insecure-remote-warning"> Bypass HTTPS requirement for remote server</label><div id="allow-insecure-remote-warning" class="status-indicator warning" hidden aria-live="polite">⚠️ Traffic to a remote backend will be sent as unencrypted HTTP — credentials and data can be intercepted. Only enable on trusted private networks.</div></div><div class="btn-row"><button id="save-backend-url-btn" class="btn primary">Save URL</button><button id="test-backend-btn" class="btn secondary">Test Connection</button></div><div id="backend-test-result" class="status-indicator"></div></section>
            <section class="card" id="wrapper-mcp-section"><h2>&#9881; MCP Wrapper Server (Local)</h2><p class="card-desc">Configure the local MCP wrapper server port.</p><div class="form-group"><label for="mcp-port-input">Wrapper Server Port</label><input type="number" id="mcp-port-input" min="1" max="65535" placeholder="9181"></div><div class="form-group checkbox-group"><label><input type="checkbox" id="enable-mcp-server-chk"> Enable MCP wrapper server on startup</label></div><div class="btn-row"><button id="save-wrapper-btn" class="btn primary">Save</button><button id="restart-mcp-btn" class="btn secondary">Restart Wrapper Server</button></div><div id="wrapper-result" class="status-indicator"></div></section>
        </div>
        <div class="tab-pane" id="pane-proxy" role="tabpanel">
            <section class="card" id="proxy-mode-section"><h2>&#128274; Proxy Mode</h2><p class="card-desc">Choose how the extension connects to the internet.</p><div class="radio-group" id="proxy-mode-group"><label class="radio-label"><input type="radio" name="proxy-mode" value="none"> <strong>No Proxy</strong> &mdash; Direct connection</label><label class="radio-label"><input type="radio" name="proxy-mode" value="system" checked> <strong>System Proxy</strong> &mdash; Auto-detect from environment</label><label class="radio-label"><input type="radio" name="proxy-mode" value="manual"> <strong>Manual</strong> &mdash; Configure proxy server</label><label class="radio-label"><input type="radio" name="proxy-mode" value="curl"> <strong>Curl (NTLM/EDR)</strong> &mdash; Use curl.exe subprocess for corporate proxies</label><label class="radio-label"><input type="radio" name="proxy-mode" value="powershell"> <strong>PowerShell (NTLM/SSO)</strong> &mdash; Use Invoke-WebRequest for corporate proxies</label></div><div id="proxy-detected-info" class="status-indicator" style="display:none;"></div></section>
            <section class="card" id="proxy-manual-section" style="display:none;"><h2>&#9881; Manual Configuration</h2><div class="form-group"><label for="proxy-host-input">Proxy Host</label><input type="text" id="proxy-host-input" placeholder="proxy.company.com"></div><div class="form-group"><label for="proxy-port-input">Port</label><input type="number" id="proxy-port-input" min="1" max="65535" value="8080"></div><div class="form-group"><label for="proxy-bypass-input">Bypass List <span style="opacity:0.6">(comma-separated, supports *.domain.com)</span></label><input type="text" id="proxy-bypass-input" placeholder="localhost,127.0.0.1,::1"></div><div id="proxy-url-preview" class="proxy-url-preview"></div><div class="btn-row"><button id="save-proxy-btn" class="btn primary">Save Proxy</button></div><div id="proxy-save-result" class="status-indicator"></div></section>
            <section class="card" id="proxy-auth-section" style="display:none;"><h2>&#128273; Proxy Authentication</h2><p class="card-desc">Credentials are stored securely in VS Code SecretStorage.</p><div class="form-group"><label for="proxy-username-input">Username</label><input type="text" id="proxy-username-input" placeholder="proxy-user"></div><div class="form-group"><label for="proxy-password-input">Password</label><div class="input-with-toggle"><input type="password" id="proxy-password-input" placeholder="Enter password..." autocomplete="off"><button class="icon-btn" id="toggle-proxy-password" title="Show/Hide" aria-label="Toggle proxy password visibility">&#128065;</button></div></div><div class="btn-row"><button id="save-proxy-creds-btn" class="btn primary">Save Credentials</button><button id="clear-proxy-creds-btn" class="btn danger-outline">Clear Credentials</button></div><div id="proxy-creds-result" class="status-indicator"></div></section>
            <section class="card" id="proxy-test-section"><h2>&#129514; Test Connection</h2><p class="card-desc">Test proxy connectivity by connecting to an external URL.</p><div class="form-group"><label for="proxy-test-url-input">Test URL</label><input type="text" id="proxy-test-url-input" placeholder="https://httpbin.org/get" value="https://httpbin.org/get"></div><div class="btn-row"><button id="test-proxy-btn" class="btn primary">Test Proxy</button><button id="detect-proxy-btn" class="btn secondary">Detect System Proxy</button></div><div id="proxy-test-result" class="status-indicator"></div></section>
        </div>
    </div>
    <script nonce="${nonce}" src="${jsUri}"></script>
    <script nonce="${nonce}" src="${proxyJsUri}"></script>
</body>
</html>`;
  }
}
