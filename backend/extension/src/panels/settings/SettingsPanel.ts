/**
 * SettingsPanel — WebviewPanel creation and message routing.
 * Thin shell that delegates business logic to SettingsMessageHandler.
 */

import * as vscode from "vscode";
import { getNonce } from "../../mcp-server-manager";
import { SettingsMessageHandler } from "./SettingsMessageHandler";

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

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-assets", "settings", "settings.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-assets", "settings", "settings.js")
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
        </div>
        <div class="tab-pane active" id="pane-llm" role="tabpanel">
            <section class="card" id="provider-section"><h2>&#129302; LLM Provider</h2><div class="provider-select-group"><label for="provider-select">Choose provider</label><select id="provider-select"><option value="anthropic">Anthropic — Claude models (recommended)</option><option value="openai">OpenAI — GPT models</option><option value="openrouter">OpenRouter — Multi-model gateway</option><option value="lmstudio">LM Studio — Local models</option><option value="ollama">Ollama — Local models (no API key needed)</option><option value="onnx">ONNX — CPU-only local (Phi-3, SmolLM2)</option></select></div></section>
            <section class="card" id="api-section" style="display:none;"><h2>&#128273; API Configuration</h2><div class="form-group"><label for="api-key-input">API Key</label><div class="input-with-toggle"><input type="password" id="api-key-input" placeholder="Enter API key..." autocomplete="off"><button class="icon-btn" id="toggle-key-visibility" title="Show/Hide" aria-label="Toggle API key visibility">&#128065;</button></div><div id="key-status" class="status-indicator"></div></div><div class="form-group"><label for="base-url-input">Base URL <span style="opacity:0.6">(optional)</span></label><div class="checkbox-group" style="margin-bottom:6px;"><label><input type="checkbox" id="use-default-url-chk" checked> Use default URL for this provider</label></div><input type="text" id="base-url-input" placeholder="Leave empty for official API" disabled></div><div class="form-group"><label for="model-input">Model</label><select id="model-input"><option value="">— Select model —</option></select></div><div class="btn-row"><button id="save-key-btn" class="btn primary" disabled>Save API Key</button><button id="clear-key-btn" class="btn danger-outline">Clear Key</button></div></section>
            <section class="card" id="ollama-section" style="display:none;"><h2>&#129433; Ollama Configuration</h2><div class="form-group"><label for="ollama-url-input">Server URL</label><input type="text" id="ollama-url-input" value="http://localhost:11434"></div><div class="form-group"><label for="ollama-model-input">Model</label><select id="ollama-model-input"><option value="">— Select model —</option></select></div><div class="btn-row"><button id="test-ollama-btn" class="btn secondary">Test Connection</button></div><div id="ollama-status" class="status-indicator"></div></section>
            <section class="card" id="test-section"><h2>&#129514; Connection Test</h2><p class="card-desc">Send a test prompt to verify your LLM configuration works end-to-end.</p><div class="btn-row"><button id="test-llm-btn" class="btn primary">Test LLM</button></div><div id="test-result" class="test-result" style="display:none;"></div></section>
        </div>
        <div class="tab-pane" id="pane-server" role="tabpanel">
            <section class="card" id="backend-mcp-section"><h2>&#127760; Backend MCP Server</h2><p class="card-desc">Configure the remote backend server URL.</p><div class="form-group"><label for="backend-url-input">Backend URL</label><input type="text" id="backend-url-input" placeholder="http://127.0.0.1:48721"></div><div class="btn-row"><button id="save-backend-url-btn" class="btn primary">Save URL</button><button id="test-backend-btn" class="btn secondary">Test Connection</button></div><div id="backend-test-result" class="status-indicator"></div></section>
            <section class="card" id="wrapper-mcp-section"><h2>&#9881; MCP Wrapper Server (Local)</h2><p class="card-desc">Configure the local MCP wrapper server port.</p><div class="form-group"><label for="mcp-port-input">Wrapper Server Port</label><input type="number" id="mcp-port-input" min="1" max="65535" placeholder="9181"></div><div class="form-group checkbox-group"><label><input type="checkbox" id="enable-mcp-server-chk"> Enable MCP wrapper server on startup</label></div><div class="btn-row"><button id="save-wrapper-btn" class="btn primary">Save</button><button id="restart-mcp-btn" class="btn secondary">Restart Wrapper Server</button></div><div id="wrapper-result" class="status-indicator"></div></section>
        </div>
    </div>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
