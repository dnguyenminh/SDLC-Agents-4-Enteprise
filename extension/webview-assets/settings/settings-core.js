/**
 * Settings Panel — Core (KSA-210 / KSA-237)
 * Shared namespace for all settings modules. The original settings.js was a
 * single IIFE; the 200-line file standard split it into cohesive modules
 * communicating through window.SettingsShared. Load order is declared in
 * SettingsPanel.ts (settings-core -> provider -> inputs -> connections ->
 * messages).
 */
(function () {
  "use strict";

  // Acquire VS Code API (store globally so proxy-tab.js can reuse)
  var vscode = (window.__vscodeApi) || (window.__vscodeApi = acquireVsCodeApi());

  var SS = (window.SettingsShared = {});
  SS.vscode = vscode;

  // ── Tab switching ──────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-pane').forEach(function(p) {
        p.classList.remove('active');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      var paneId = btn.getAttribute('data-tab');
      document.getElementById(paneId).classList.add('active');
    });
  });

  // ── DOM elements — shared registry (modules alias what they use) ──
  // LLM Provider
  SS.providerSelect = document.getElementById("provider-select");
  SS.apiSection = document.getElementById("api-section");
  SS.ollamaSection = document.getElementById("ollama-section");
  SS.apiKeyInput = document.getElementById("api-key-input");
  SS.toggleKeyBtn = document.getElementById("toggle-key-visibility");
  SS.modelInput = document.getElementById("model-input");
  SS.baseUrlInput = document.getElementById("base-url-input");
  SS.useDefaultUrlChk = document.getElementById("use-default-url-chk");
  SS.saveKeyBtn = document.getElementById("save-key-btn");
  SS.clearKeyBtn = document.getElementById("clear-key-btn");
  SS.keyStatus = document.getElementById("key-status");
  SS.ollamaUrlInput = document.getElementById("ollama-url-input");
  SS.ollamaModelInput = document.getElementById("ollama-model-input");
  SS.testOllamaBtn = document.getElementById("test-ollama-btn");
  SS.ollamaStatus = document.getElementById("ollama-status");
  SS.testLlmBtn = document.getElementById("test-llm-btn");
  SS.testResult = document.getElementById("test-result");
  // Server Settings
  SS.backendUrlInput = document.getElementById("backend-url-input");
  SS.saveBackendBtn = document.getElementById("save-backend-url-btn");
  SS.testBackendBtn = document.getElementById("test-backend-btn");
  SS.backendResult = document.getElementById("backend-test-result");
  // SA4E-320 — opt-in HTTPS bypass for remote backend
  SS.allowInsecureChk = document.getElementById("allow-insecure-remote-chk");
  SS.allowInsecureWarning = document.getElementById("allow-insecure-remote-warning");
  SS.mcpPortInput = document.getElementById("mcp-port-input");
  SS.enableMcpChk = document.getElementById("enable-mcp-server-chk");
  SS.saveWrapperBtn = document.getElementById("save-wrapper-btn");
  SS.restartMcpBtn = document.getElementById("restart-mcp-btn");
  SS.wrapperResult = document.getElementById("wrapper-result");
  // Pega Platform Connection
  SS.pegaEndpointInput = document.getElementById("pega-endpoint-input");
  SS.pegaUsernameInput = document.getElementById("pega-username-input");
  SS.pegaPasswordInput = document.getElementById("pega-password-input");
  SS.togglePegaPasswordBtn = document.getElementById("toggle-pega-password-visibility");
  SS.savePegaBtn = document.getElementById("save-pega-btn");
  SS.testPegaBtn = document.getElementById("test-pega-btn");
  SS.fetchPegaBtn = document.getElementById("fetch-pega-btn");
  SS.pegaTestResult = document.getElementById("pega-test-result");
  // Atlassian Connection
  SS.atlassianUrlInput = document.getElementById("atlassian-url-input");
  SS.atlassianEmailInput = document.getElementById("atlassian-email-input");
  SS.atlassianTokenInput = document.getElementById("atlassian-token-input");
  SS.toggleAtlassianTokenBtn = document.getElementById("toggle-atlassian-token-visibility");
  SS.saveAtlassianBtn = document.getElementById("save-atlassian-btn");
  SS.testAtlassianBtn = document.getElementById("test-atlassian-btn");
  SS.atlassianTestResult = document.getElementById("atlassian-test-result");

  // ── Shared state ──
  // Models list currentProvider = "anthropic";
  SS.currentProvider = "anthropic";
  SS.savedState = { hasAnthropicKey: false, hasOpenaiKey: false };

  // Per-provider state — each provider stores its own config
  SS.providerState = {};
  SS.getProviderState = function (p) {
    if (!SS.providerState[p]) {
      SS.providerState[p] = { useDefaultUrl: true, baseUrl: "", model: "", testResult: null };
    }
    return SS.providerState[p];
  };

  // Model catalog — KSA-237: NO hardcoded list. The extension is the single
  // source of truth and pushes a `models` message per provider (when base URL
  // points to gateway, it fetches /v1/models which returns the real model list).
  SS.modelsByProvider = {};
  SS.defaultModelByProvider = {};

  // Providers that DON'T need API key (local servers)
  SS.localProviders = ["ollama", "lmstudio", "onnx"];

  // Default URLs per provider
  SS.defaultUrls = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com/v1",
    lmstudio: "http://localhost:1234/v1",
    openrouter: "https://openrouter.ai/api/v1",
    ollama: "http://localhost:11434",
    onnx: ""
  };

  SS.defaultModelFor = function (provider) {
    return SS.defaultModelByProvider[provider] || "";
  };

  SS.modelsFor = function (provider) {
    return SS.modelsByProvider[provider] || [];
  };

  SS.showStatus = function (el, msg, type) {
    el.textContent = msg;
    el.className = "status-indicator " + (type || "");
  };

  SS.escapeHtml = function (str) {
    if (!str) return "";
    return str
      .replace(/&/g, "\x26amp;")
      .replace(/</g, "\x26lt;")
      .replace(/>/g, "\x26gt;")
      .replace(/"/g, "\x26quot;");
  };
})();
