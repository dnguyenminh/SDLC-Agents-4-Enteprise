/**
 * Settings Panel — Webview JS (KSA-210 / KSA-237)
 * Manages form state, section visibility, and postMessage communication with extension.
 */

(function () {
  "use strict";

  // Acquire VS Code API
  const vscode = acquireVsCodeApi();

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

  // DOM elements - LLM Provider
  const providerSelect = document.getElementById("provider-select");
  const apiSection = document.getElementById("api-section");
  const ollamaSection = document.getElementById("ollama-section");

  const apiKeyInput = document.getElementById("api-key-input");
  const toggleKeyBtn = document.getElementById("toggle-key-visibility");
  const modelInput = document.getElementById("model-input");
  const baseUrlInput = document.getElementById("base-url-input");
  const useDefaultUrlChk = document.getElementById("use-default-url-chk");
  const saveKeyBtn = document.getElementById("save-key-btn");
  const clearKeyBtn = document.getElementById("clear-key-btn");
  const keyStatus = document.getElementById("key-status");

  const ollamaUrlInput = document.getElementById("ollama-url-input");
  const ollamaModelInput = document.getElementById("ollama-model-input");
  const testOllamaBtn = document.getElementById("test-ollama-btn");
  const ollamaStatus = document.getElementById("ollama-status");

  const testLlmBtn = document.getElementById("test-llm-btn");
  const testResult = document.getElementById("test-result");

  // DOM elements - Server Settings
  const backendUrlInput = document.getElementById("backend-url-input");
  const saveBackendBtn = document.getElementById("save-backend-url-btn");
  const testBackendBtn = document.getElementById("test-backend-btn");
  const backendResult = document.getElementById("backend-test-result");

  const mcpPortInput = document.getElementById("mcp-port-input");
  const enableMcpChk = document.getElementById("enable-mcp-server-chk");
  const saveWrapperBtn = document.getElementById("save-wrapper-btn");
  const restartMcpBtn = document.getElementById("restart-mcp-btn");
  const wrapperResult = document.getElementById("wrapper-result");

  // Models list currentProvider = "anthropic";
  let currentProvider = "anthropic";
  let savedState = { hasAnthropicKey: false, hasOpenaiKey: false };

  // Per-provider state — each provider stores its own config
  var providerState = {};
  function getProviderState(p) {
    if (!providerState[p]) {
      providerState[p] = { useDefaultUrl: true, baseUrl: "", model: "", testResult: null };
    }
    return providerState[p];
  }
  function saveCurrentProviderState() {
    var s = getProviderState(currentProvider);
    s.useDefaultUrl = useDefaultUrlChk.checked;
    s.baseUrl = baseUrlInput.value;
    s.model = modelInput.value;
  }
  function restoreProviderState(provider) {
    var s = getProviderState(provider);
    useDefaultUrlChk.checked = s.useDefaultUrl;
    if (s.useDefaultUrl) {
      baseUrlInput.value = defaultUrls[provider] || "";
      baseUrlInput.disabled = true;
    } else {
      baseUrlInput.value = s.baseUrl || "";
      baseUrlInput.disabled = false;
    }
    // Restore test result
    if (s.testResult) {
      testResult.style.display = "block";
      testResult.className = "test-result " + (s.testResult.success ? "success" : "error");
      testResult.innerHTML = s.testResult.html;
    } else {
      testResult.style.display = "none";
    }
  }

  // Model catalog — KSA-237: NO hardcoded list. The extension is the single
  // source of truth and pushes a `models` message per provider (when base URL
  // points to gateway, it fetches /v1/models which returns the real model list).
  const modelsByProvider = {};
  const defaultModelByProvider = {};

  // ─── Provider Selection ───────────────────────────────────────────────────

  providerSelect.addEventListener("change", function (e) {
    // Save current provider state before switching
    saveCurrentProviderState();
    var provider = e.target.value;
    currentProvider = provider;
    // Restore the new provider's state
    restoreProviderState(provider);
    updateSections(provider);
    vscode.postMessage({ type: "setProvider", provider: provider });
    // Auto-save default URL when checkbox is checked
    var s = getProviderState(provider);
    if (s.useDefaultUrl && defaultUrls[provider]) {
      vscode.postMessage({ type: "setBaseUrl", provider: provider, url: defaultUrls[provider] });
    }
    vscode.postMessage({ type: "getModels", provider: provider });
  });

  function defaultModelFor(provider) {
    return defaultModelByProvider[provider] || "";
  }

  function modelsFor(provider) {
    return modelsByProvider[provider] || [];
  }

  // Providers that DON'T need API key (local servers)
  var localProviders = ["ollama", "lmstudio", "onnx"];

  function updateSections(provider) {
    if (provider === "ollama") {
      apiSection.style.display = "none";
      ollamaSection.style.display = "block";
      updateOllamaModelOptions(provider);
    } else {
      apiSection.style.display = "block";
      ollamaSection.style.display = "none";
      modelInput.placeholder = defaultModelFor(provider);

      // Hide API Key row for local providers
      var keyRow = apiKeyInput ? apiKeyInput.closest(".form-group") : null;
      var btnRow = saveKeyBtn ? saveKeyBtn.closest(".btn-row") : null;
      if (localProviders.indexOf(provider) !== -1) {
        if (keyRow) keyRow.style.display = "none";
        if (btnRow) btnRow.style.display = "none";
        if (keyStatus) keyStatus.style.display = "none";
      } else {
        if (keyRow) keyRow.style.display = "";
        if (btnRow) btnRow.style.display = "";
        if (keyStatus) keyStatus.style.display = "";
        if (apiKeyInput) { apiKeyInput.placeholder = "Enter API key..."; }
      }

      // Update default URL checkbox and input state
      if (useDefaultUrlChk.checked) {
        baseUrlInput.value = defaultUrls[provider] || "";
        baseUrlInput.disabled = true;
      } else {
        baseUrlInput.disabled = false;
      }
      if (baseUrlInput) {
        if (provider === "lmstudio") {
          baseUrlInput.placeholder = "http://localhost:1234/v1";
        } else if (provider === "openrouter") {
          baseUrlInput.placeholder = "https://openrouter.ai/api/v1";
        } else {
          baseUrlInput.placeholder = "Leave empty for official API";
        }
      }
      updateKeyStatus(provider);
    }
    updateModelOptions(provider);
  }

  function updateOllamaModelOptions(provider) {
    var select = document.getElementById("ollama-model-input");
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = "";
    var models = modelsFor("ollama");
    models.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
    var ids = models.map(function (m) { return m.id; });
    if (currentVal && ids.indexOf(currentVal) !== -1) {
      select.value = currentVal;
    } else if (models.length > 0) {
      select.value = models[0].id;
    }
  }

  function updateModelOptions(provider) {
    var select = document.getElementById("model-input");
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = "";
    var models = modelsFor(provider);

    models.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m.id;
      var label = m.name;
      if (typeof m.rateMultiplier === "number") {
        if (m.rateMultiplier === 0) {
          label += " \u2014 Free";
        } else {
          label += " \u2014 " + m.rateMultiplier + (m.rateMultiplier === 1 ? " Credit" : " Credits");
        }
      }
      opt.textContent = label;
      if (m.description) {
        opt.title = m.description;
      }
      select.appendChild(opt);
    });

    var ids = models.map(function (m) { return m.id; });
    if (currentVal && ids.indexOf(currentVal) !== -1) {
      select.value = currentVal;
    } else if (models.length > 0) {
      select.value = models[0].id;
    }

    updateModelDescription(select.value, models);
  }

  function updateModelDescription(modelId, models) {
    var infoEl = document.getElementById("model-description-info");
    if (!infoEl) {
      var select = document.getElementById("model-input");
      if (!select || !select.parentNode) return;
      infoEl = document.createElement("div");
      infoEl.id = "model-description-info";
      infoEl.style.cssText = "margin-top:4px;font-size:11px;opacity:0.7;line-height:1.4;min-height:16px;";
      select.parentNode.insertBefore(infoEl, select.nextSibling);
    }
    var found = null;
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === modelId) { found = models[i]; break; }
    }
    infoEl.textContent = (found && found.description) ? found.description : "";
  }

  function updateKeyStatus(provider) {
    var url = baseUrlInput ? baseUrlInput.value : "";
    if (url.indexOf("127.0.0.1") !== -1) {
      keyStatus.textContent = "\u2705 No API key needed \u2014 gateway uses Kiro IDE credentials";
      keyStatus.className = "status-indicator success";
      return;
    }
    var hasKey =
      provider === "anthropic" ? savedState.hasAnthropicKey : savedState.hasOpenaiKey;
    if (hasKey) {
      keyStatus.textContent = "\u2705 Key saved";
      keyStatus.className = "status-indicator success";
    } else {
      keyStatus.textContent = "\u26A0\uFE0F No key set";
      keyStatus.className = "status-indicator warning";
    }
  }

  // ─── API Key ──────────────────────────────────────────────────────────────

  toggleKeyBtn.addEventListener("click", function () {
    var isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.textContent = isPassword ? "\uD83D\uDE48" : "\uD83D\uDC41\uFE0F";
    toggleKeyBtn.title = isPassword ? "Hide" : "Show";
  });

  apiKeyInput.addEventListener("input", function () {
    saveKeyBtn.disabled = apiKeyInput.value.trim().length === 0;
  });

  saveKeyBtn.addEventListener("click", function () {
    var key = apiKeyInput.value.trim();
    if (!key) return;
    saveKeyBtn.classList.add("loading");
    saveKeyBtn.disabled = true;
    vscode.postMessage({ type: "saveApiKey", provider: currentProvider, key: key });
  });

  clearKeyBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "clearApiKey", provider: currentProvider });
    apiKeyInput.value = "";
    saveKeyBtn.disabled = true;
  });

  modelInput.addEventListener("change", function () {
    vscode.postMessage({ type: "setModel", model: modelInput.value });
    updateModelDescription(modelInput.value, modelsFor(currentProvider));
  });

  // Default URLs per provider
  var defaultUrls = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com/v1",
    lmstudio: "http://localhost:1234/v1",
    openrouter: "https://openrouter.ai/api/v1",
    ollama: "http://localhost:11434",
    onnx: ""
  };

  // Use default URL checkbox
  useDefaultUrlChk.addEventListener("change", function () {
    var s = getProviderState(currentProvider);
    if (useDefaultUrlChk.checked) {
      baseUrlInput.disabled = true;
      baseUrlInput.value = defaultUrls[currentProvider] || "";
      s.useDefaultUrl = true;
      s.baseUrl = baseUrlInput.value;
      vscode.postMessage({ type: "setBaseUrl", provider: currentProvider, url: baseUrlInput.value });
    } else {
      baseUrlInput.disabled = false;
      baseUrlInput.value = s.baseUrl || "";
      s.useDefaultUrl = false;
      baseUrlInput.focus();
    }
    updateKeyStatus(currentProvider);
  });

  // Base URL change (debounced) — also toggle gateway info visibility
  var baseUrlTimeout = null;
  baseUrlInput.addEventListener("input", function () {
    clearTimeout(baseUrlTimeout);
    updateKeyStatus(currentProvider);
    baseUrlTimeout = setTimeout(function () {
      vscode.postMessage({ type: "setBaseUrl", provider: currentProvider, url: baseUrlInput.value.trim() });
    }, 500);
  });

  // ─── Ollama ───────────────────────────────────────────────────────────────

  var urlTimeout = null;
  ollamaUrlInput.addEventListener("input", function () {
    clearTimeout(urlTimeout);
    urlTimeout = setTimeout(function () {
      vscode.postMessage({ type: "setOllamaUrl", url: ollamaUrlInput.value.trim() });
    }, 500);
  });

  var ollamaModelTimeout = null;
  ollamaModelInput.addEventListener("change", function () {
    vscode.postMessage({ type: "setModel", model: ollamaModelInput.value });
  });

  testOllamaBtn.addEventListener("click", function () {
    testOllamaBtn.classList.add("loading");
    testOllamaBtn.disabled = true;
    ollamaStatus.textContent = "";
    ollamaStatus.className = "status-indicator";
    vscode.postMessage({
      type: "testOllamaConnection",
      url: ollamaUrlInput.value.trim() || "http://localhost:11434",
    });
  });

  // ─── Test LLM ─────────────────────────────────────────────────────────────

  testLlmBtn.addEventListener("click", () => {
    testLlmBtn.classList.add("loading");
    testLlmBtn.disabled = true;
    testResult.style.display = "none";
    vscode.postMessage({
      type: "testLlmConnection",
      provider: currentProvider,
      baseUrl: baseUrlInput.value.trim(),
      model: modelInput.value || (ollamaModelInput ? ollamaModelInput.value : "")
    });
  });

  // ─── Server Settings Events ───────────────────────────────────────────────

  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = "status-indicator " + (type || "");
  }

  saveBackendBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "setBackendUrl", url: backendUrlInput.value.trim() });
    showStatus(backendResult, "Saved \u2713", "success");
  });

  testBackendBtn.addEventListener("click", () => {
    backendResult.textContent = "Testing...";
    backendResult.className = "status-indicator";
    vscode.postMessage({ type: "testBackendConnection", url: backendUrlInput.value.trim() });
  });

  saveWrapperBtn.addEventListener("click", () => {
    const port = parseInt(mcpPortInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      showStatus(wrapperResult, "Invalid port (1\u201365535)", "error");
      return;
    }
    vscode.postMessage({ type: "setMcpServerPort", port: port });
    vscode.postMessage({ type: "setEnableMcpServer", enabled: enableMcpChk.checked });
    showStatus(wrapperResult, "Saved \u2713", "success");
  });

  restartMcpBtn.addEventListener("click", () => {
    wrapperResult.textContent = "Restarting...";
    wrapperResult.className = "status-indicator";
    vscode.postMessage({ type: "restartMcpServer" });
  });

  // ─── Post Message Handler ──────────────────────────────────────────────────────

  window.addEventListener("message", function (event) {
    var msg = event.data;
    switch (msg.type) {
      case "state": handleState(msg); break;
      case "models": handleModels(msg); break;
      case "keySaved": handleKeySaved(msg); break;
      case "keyCleared": handleKeyCleared(msg); break;
      case "ollamaTestResult": handleOllamaTestResult(msg); break;
      case "llmTestResult": handleLlmTestResult(msg); break;
      case "backendTestResult":
        const lat = msg.latencyMs ? " (" + msg.latencyMs + "ms)" : "";
        showStatus(backendResult, (msg.success ? "\u2705 " : "\u274c ") + msg.message + lat, msg.success ? "success" : "error");
        break;
      case "mcpServerRestarted":
        showStatus(wrapperResult, (msg.success ? "\u2705 " : "\u274c ") + msg.message, msg.success ? "success" : "error");
        break;
    }
  });

  function handleState(msg) {
    currentProvider = msg.provider;
    savedState.hasAnthropicKey = msg.hasAnthropicKey;
    savedState.hasOpenaiKey = msg.hasOpenaiKey;

    providerSelect.value = msg.provider;

    updateModelOptions(msg.provider);
    if (msg.model) { modelInput.value = msg.model; }
    if (msg.model) { ollamaModelInput.value = msg.model; }

    baseUrlInput.value = msg.baseUrl || "";
    // Set checkbox state — checked if URL matches default or is empty
    var defUrl = defaultUrls[msg.provider] || "";
    if (!msg.baseUrl || msg.baseUrl === defUrl) {
      useDefaultUrlChk.checked = true;
      baseUrlInput.value = defUrl;
      baseUrlInput.disabled = true;
    } else {
      useDefaultUrlChk.checked = false;
      baseUrlInput.value = msg.baseUrl;
      baseUrlInput.disabled = false;
    }
    // Initialize per-provider state from loaded config
    var s = getProviderState(msg.provider);
    s.useDefaultUrl = useDefaultUrlChk.checked;
    s.baseUrl = baseUrlInput.value;
    s.model = msg.model || "";

    ollamaUrlInput.value = msg.ollamaUrl || "http://localhost:11434";

    if (msg.backendUrl !== undefined) {
      backendUrlInput.value = msg.backendUrl;
    }
    if (msg.mcpServerPort !== undefined) {
      mcpPortInput.value = String(msg.mcpServerPort);
    }
    if (msg.enableMcpServer !== undefined) {
      enableMcpChk.checked = msg.enableMcpServer;
    }

    updateSections(msg.provider);
  }

  function handleModels(msg) {
    modelsByProvider[msg.provider] = msg.models || [];
    if (typeof msg.defaultModel === "string") {
      defaultModelByProvider[msg.provider] = msg.defaultModel;
    }
    if (msg.provider === currentProvider) {
      updateModelOptions(msg.provider);
      if (msg.selected) {
        var select = document.getElementById("model-input");
        if (select) {
          var ids = (msg.models || []).map(function (m) { return m.id; });
          if (ids.indexOf(msg.selected) !== -1) {
            select.value = msg.selected;
          }
        }
      }
      if (currentProvider !== "ollama") {
        modelInput.placeholder = defaultModelFor(currentProvider);
      }
    }
  }

  function handleKeySaved(msg) {
    saveKeyBtn.classList.remove("loading");
    saveKeyBtn.disabled = apiKeyInput.value.trim().length === 0;
    if (msg.success) {
      savedState[msg.provider === "anthropic" ? "hasAnthropicKey" : "hasOpenaiKey"] = true;
      keyStatus.textContent = "\u2705 Key saved";
      keyStatus.className = "status-indicator success";
      apiKeyInput.value = "";
      saveKeyBtn.disabled = true;
    } else {
      keyStatus.textContent = "\u274C Error: " + (msg.error || "Unknown error");
      keyStatus.className = "status-indicator error";
    }
  }

  function handleKeyCleared(msg) {
    savedState[msg.provider === "anthropic" ? "hasAnthropicKey" : "hasOpenaiKey"] = false;
    updateKeyStatus(currentProvider);
  }

  function handleOllamaTestResult(msg) {
    testOllamaBtn.classList.remove("loading");
    testOllamaBtn.disabled = false;
    if (msg.success) {
      ollamaStatus.textContent = "\u2705 " + msg.message;
      ollamaStatus.className = "status-indicator success";
    } else {
      ollamaStatus.textContent = "\u274C " + msg.message;
      ollamaStatus.className = "status-indicator error";
    }
  }

  function handleLlmTestResult(msg) {
    testLlmBtn.classList.remove("loading");
    testLlmBtn.disabled = false;
    testResult.style.display = "block";
    var html;
    if (msg.success) {
      testResult.className = "test-result success";
      html =
        '<div class="result-label">\u2705 Success</div>' +
        '<div class="result-body">' + escapeHtml(msg.message) + "</div>" +
        '<div class="result-meta">' +
        (msg.model ? "Model: " + escapeHtml(msg.model) : "") +
        (msg.latencyMs ? " \u2022 Latency: " + msg.latencyMs + "ms" : "") +
        "</div>";
    } else {
      testResult.className = "test-result error";
      html =
        '<div class="result-label">\u274C Failed</div>' +
        '<div class="result-body">' + escapeHtml(msg.error || msg.message) + "</div>" +
        (msg.latencyMs ? '<div class="result-meta">Latency: ' + msg.latencyMs + "ms</div>" : "");
    }
    testResult.innerHTML = html;
    // Save per-provider
    var s = getProviderState(currentProvider);
    s.testResult = { success: msg.success, html: html };
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  vscode.postMessage({ type: "ready" });
})();
