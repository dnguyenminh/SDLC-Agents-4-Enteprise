/**
 * Proxy Tab — Webview JS for proxy configuration pane (part 1: bindings).
 * Handles form binding, validation, URL preview, and postMessage
 * communication. The message handlers live in proxy-tab-handlers.js
 * (200-line file standard); shared state flows through window.ProxyTab.
 * Load order: proxy-tab.js -> proxy-tab-handlers.js.
 */
(function () {
  "use strict";

  var vscode = (window.__vscodeApi) || (window.__vscodeApi = acquireVsCodeApi());

  var PT = (window.ProxyTab = {});
  PT.vscode = vscode;

  // DOM Elements — Mode
  PT.modeRadios = document.querySelectorAll('input[name="proxy-mode"]');
  PT.detectedInfo = document.getElementById("proxy-detected-info");

  // DOM Elements — Manual config
  PT.manualSection = document.getElementById("proxy-manual-section");
  PT.authSection = document.getElementById("proxy-auth-section");
  PT.hostInput = document.getElementById("proxy-host-input");
  PT.portInput = document.getElementById("proxy-port-input");
  PT.bypassInput = document.getElementById("proxy-bypass-input");
  PT.urlPreview = document.getElementById("proxy-url-preview");
  PT.saveProxyBtn = document.getElementById("save-proxy-btn");
  PT.saveResult = document.getElementById("proxy-save-result");

  // DOM Elements — Credentials
  PT.usernameInput = document.getElementById("proxy-username-input");
  PT.passwordInput = document.getElementById("proxy-password-input");
  PT.togglePwdBtn = document.getElementById("toggle-proxy-password");
  PT.saveCredsBtn = document.getElementById("save-proxy-creds-btn");
  PT.clearCredsBtn = document.getElementById("clear-proxy-creds-btn");
  PT.credsResult = document.getElementById("proxy-creds-result");

  // DOM Elements — Test
  PT.testBtn = document.getElementById("test-proxy-btn");
  PT.detectBtn = document.getElementById("detect-proxy-btn");
  PT.testResult = document.getElementById("proxy-test-result");
  PT.testUrlInput = document.getElementById("proxy-test-url-input");

  PT.currentMode = "system";

  // ── Mode Selection ────────────────────────────────────────────────

  PT.modeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      PT.currentMode = radio.value;
      PT.updateVisibility();
      vscode.postMessage({ type: "setProxyMode", mode: radio.value });
    });
  });

  PT.updateVisibility = function () {
    var currentMode = PT.currentMode;
    var isManual = currentMode === "manual";
    var isCurl = currentMode === "curl";
    var isPwsh = currentMode === "powershell";
    var isNone = currentMode === "none";
    var showConfig = isManual || isCurl || isPwsh;
    PT.manualSection.style.display = showConfig ? "block" : "none";
    PT.authSection.style.display = isManual ? "block" : "none";
    // Hide test section when mode = "none" (no proxy to test)
    var testSection = document.getElementById("proxy-test-section");
    if (testSection) { testSection.style.display = isNone ? "none" : "block"; }
    // Hide "Detect System Proxy" button in curl mode (irrelevant)
    if (PT.detectBtn) { PT.detectBtn.style.display = isCurl ? "none" : ""; }
    // Curl mode: hide host/port/urlPreview, only show bypass list
    var hostGroup = PT.hostInput.closest(".form-group");
    var portGroup = PT.portInput.closest(".form-group");
    if (hostGroup) { hostGroup.style.display = isCurl ? "none" : ""; }
    if (portGroup) { portGroup.style.display = isCurl ? "none" : ""; }
    // Update section title for curl mode
    var sectionTitle = PT.manualSection.querySelector("h2");
    if (sectionTitle) {
      sectionTitle.textContent = isCurl ? "\u2699 Curl Bypass Configuration" : "\u2699 Manual Configuration";
    }
    PT.updateUrlPreview();
  };

  // ── URL Preview ──────────────────────────────────────────────────

  PT.updateUrlPreview = function () {
    var currentMode = PT.currentMode;
    if (currentMode !== "manual" && currentMode !== "curl" && currentMode !== "powershell") {
      PT.urlPreview.textContent = "";
      return;
    }
    var host = PT.hostInput.value.trim();
    var port = PT.portInput.value.trim();
    if (currentMode === "curl") {
      PT.urlPreview.textContent = "";
      return;
    }
    if (host && port) {
      var prefix = currentMode === "powershell" ? "PowerShell Proxy: " : "Proxy URL: ";
      PT.urlPreview.textContent = prefix + "http://" + host + ":" + port;
    } else if (currentMode === "powershell") {
      PT.urlPreview.textContent = "PowerShell: using Windows SSO (no explicit proxy)";
    } else {
      PT.urlPreview.textContent = "";
    }
  };

  PT.hostInput.addEventListener("input", PT.updateUrlPreview);
  PT.portInput.addEventListener("input", PT.updateUrlPreview);

  // ── Save Proxy ───────────────────────────────────────────────────

  PT.saveProxyBtn.addEventListener("click", function () {
    var host = PT.hostInput.value.trim();
    var port = parseInt(PT.portInput.value, 10);
    var bypass = PT.bypassInput.value.trim();
    if (!host) {
      PT.showStatus(PT.saveResult, "\u274C Host is required", "error");
      return;
    }
    if (isNaN(port) || port < 1 || port > 65535) {
      PT.showStatus(PT.saveResult, "\u274C Port must be 1\u201365535", "error");
      return;
    }
    PT.saveProxyBtn.classList.add("loading");
    PT.saveProxyBtn.disabled = true;
    vscode.postMessage({ type: "saveProxy", host: host, port: port, bypass: bypass });
  });

  // ── Credentials ──────────────────────────────────────────────────

  PT.togglePwdBtn.addEventListener("click", function () {
    var isHidden = PT.passwordInput.type === "password";
    PT.passwordInput.type = isHidden ? "text" : "password";
    PT.togglePwdBtn.textContent = isHidden ? "\uD83D\uDE48" : "\uD83D\uDC41";
  });

  PT.saveCredsBtn.addEventListener("click", function () {
    var username = PT.usernameInput.value.trim();
    var password = PT.passwordInput.value;
    if (!username || !password) {
      PT.showStatus(PT.credsResult, "\u274C Username and password required", "error");
      return;
    }
    PT.saveCredsBtn.classList.add("loading");
    PT.saveCredsBtn.disabled = true;
    vscode.postMessage({
      type: "saveProxyCredentials",
      username: username,
      password: password,
    });
  });

  PT.clearCredsBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "clearProxyCredentials" });
  });

  // ── Test Connection ──────────────────────────────────────────────

  PT.testBtn.addEventListener("click", function () {
    PT.testBtn.classList.add("loading");
    PT.testBtn.disabled = true;
    PT.testResult.textContent = "Testing...";
    PT.testResult.className = "status-indicator";
    vscode.postMessage({
      type: "testProxyConnection",
      mode: PT.currentMode,
      host: PT.hostInput.value.trim(),
      port: parseInt(PT.portInput.value, 10) || 8080,
      username: PT.usernameInput.value.trim() || undefined,
      password: PT.passwordInput.value || undefined,
      testUrl: (PT.testUrlInput && PT.testUrlInput.value.trim()) || "https://httpbin.org/get",
    });
  });

  PT.detectBtn.addEventListener("click", function () {
    PT.detectBtn.classList.add("loading");
    PT.detectBtn.disabled = true;
    vscode.postMessage({ type: "detectSystemProxy" });
  });

  // ── Helpers (shared with proxy-tab-handlers.js) ──────────────────

  PT.setModeRadio = function (mode) {
    PT.modeRadios.forEach(function (r) { r.checked = r.value === mode; });
  };

  PT.showStatus = function (el, msg, type) {
    el.textContent = msg;
    el.className = "status-indicator " + (type || "");
  };
})();
