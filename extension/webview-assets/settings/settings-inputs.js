/**
 * Settings Panel — LLM Input Bindings
 * API key save/clear, model input (debounced persistence), default-URL
 * checkbox, base URL, Ollama settings, LLM test button, keySaved/keyCleared
 * message handlers.
 */
(function () {
  "use strict";
  var SS = window.SettingsShared;

  var vscode = SS.vscode;
  var apiKeyInput = SS.apiKeyInput;
  var toggleKeyBtn = SS.toggleKeyBtn;
  var saveKeyBtn = SS.saveKeyBtn;
  var clearKeyBtn = SS.clearKeyBtn;
  var keyStatus = SS.keyStatus;
  var modelInput = SS.modelInput;
  var useDefaultUrlChk = SS.useDefaultUrlChk;
  var baseUrlInput = SS.baseUrlInput;
  var ollamaUrlInput = SS.ollamaUrlInput;
  var ollamaModelInput = SS.ollamaModelInput;
  var testOllamaBtn = SS.testOllamaBtn;
  var ollamaStatus = SS.ollamaStatus;
  var testLlmBtn = SS.testLlmBtn;
  var testResult = SS.testResult;
  var savedState = SS.savedState;
  var defaultUrls = SS.defaultUrls;

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
    vscode.postMessage({ type: "saveApiKey", provider: SS.currentProvider, key: key });
  });

  clearKeyBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "clearApiKey", provider: SS.currentProvider });
    apiKeyInput.value = "";
    saveKeyBtn.disabled = true;
  });

  var modelInputTimeout = null;
  modelInput.addEventListener("input", function () {
    SS.updateModelDescription(modelInput.value.trim(), SS.modelsFor(SS.currentProvider));
    clearTimeout(modelInputTimeout);
    // Debounce: persist free-typed model ids even if the user never blurs the field.
    modelInputTimeout = setTimeout(function () {
      var val = modelInput.value.trim();
      if (val) vscode.postMessage({ type: "setModel", model: val });
    }, 400);
  });
  modelInput.addEventListener("change", function () {
    var val = modelInput.value.trim();
    vscode.postMessage({ type: "setModel", model: val });
    SS.updateModelDescription(val, SS.modelsFor(SS.currentProvider));
  });

  // Use default URL checkbox
  useDefaultUrlChk.addEventListener("change", function () {
    var s = SS.getProviderState(SS.currentProvider);
    if (useDefaultUrlChk.checked) {
      baseUrlInput.disabled = true;
      baseUrlInput.value = defaultUrls[SS.currentProvider] || "";
      s.useDefaultUrl = true;
      s.baseUrl = baseUrlInput.value;
      vscode.postMessage({ type: "setBaseUrl", provider: SS.currentProvider, url: baseUrlInput.value });
    } else {
      baseUrlInput.disabled = false;
      baseUrlInput.value = s.baseUrl || "";
      s.useDefaultUrl = false;
      baseUrlInput.focus();
    }
    SS.updateKeyStatus(SS.currentProvider);
  });

  // Base URL change (debounced) — also toggle gateway info visibility
  var baseUrlTimeout = null;
  baseUrlInput.addEventListener("input", function () {
    clearTimeout(baseUrlTimeout);
    SS.updateKeyStatus(SS.currentProvider);
    baseUrlTimeout = setTimeout(function () {
      vscode.postMessage({ type: "setBaseUrl", provider: SS.currentProvider, url: baseUrlInput.value.trim() });
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
      provider: SS.currentProvider,
      baseUrl: baseUrlInput.value.trim(),
      model: modelInput.value || (ollamaModelInput ? ollamaModelInput.value : "")
    });
  });

  // Ollama model <select> options (called from settings-provider.js updateSections)
  SS.updateOllamaModelOptions = function (provider) {
    var select = document.getElementById("ollama-model-input");
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = "";
    var models = SS.modelsFor("ollama");
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
  };

  // ─── Key message handlers (dispatched by settings-messages.js) ────────────

  SS.handleKeySaved = function (msg) {
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
  };

  SS.handleKeyCleared = function (msg) {
    savedState[msg.provider === "anthropic" ? "hasAnthropicKey" : "hasOpenaiKey"] = false;
    SS.updateKeyStatus(SS.currentProvider);
  };
})();
