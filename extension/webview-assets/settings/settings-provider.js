/**
 * Settings Panel — Provider Selection & Model Catalog UI
 * Provider dropdown handling (per-provider state save/restore), section
 * visibility, model datalist/options rendering, key status hint.
 */
(function () {
  "use strict";
  var SS = window.SettingsShared;

  var vscode = SS.vscode;
  var providerSelect = SS.providerSelect;
  var apiSection = SS.apiSection;
  var ollamaSection = SS.ollamaSection;
  var apiKeyInput = SS.apiKeyInput;
  var saveKeyBtn = SS.saveKeyBtn;
  var keyStatus = SS.keyStatus;
  var modelInput = SS.modelInput;
  var baseUrlInput = SS.baseUrlInput;
  var useDefaultUrlChk = SS.useDefaultUrlChk;
  var testResult = SS.testResult;
  var savedState = SS.savedState;
  var defaultUrls = SS.defaultUrls;
  var localProviders = SS.localProviders;

  function saveCurrentProviderState() {
    var s = SS.getProviderState(SS.currentProvider);
    s.useDefaultUrl = useDefaultUrlChk.checked;
    s.baseUrl = baseUrlInput.value;
    s.model = modelInput.value;
  }
  function restoreProviderState(provider) {
    var s = SS.getProviderState(provider);
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

  // ─── Provider Selection ───────────────────────────────────────────────────

  providerSelect.addEventListener("change", function (e) {
    // Save current provider state before switching
    saveCurrentProviderState();
    var provider = e.target.value;
    SS.currentProvider = provider;
    // Restore the new provider's state
    restoreProviderState(provider);
    SS.updateSections(provider);
    vscode.postMessage({ type: "setProvider", provider: provider });
    // Auto-save default URL when checkbox is checked
    var s = SS.getProviderState(provider);
    if (s.useDefaultUrl && defaultUrls[provider]) {
      vscode.postMessage({ type: "setBaseUrl", provider: provider, url: defaultUrls[provider] });
    }
    vscode.postMessage({ type: "getModels", provider: provider });
  });

  SS.updateSections = function (provider) {
    if (provider === "ollama") {
      apiSection.style.display = "none";
      ollamaSection.style.display = "block";
      SS.updateOllamaModelOptions(provider);
    } else {
      apiSection.style.display = "block";
      ollamaSection.style.display = "none";
      modelInput.placeholder = SS.defaultModelFor(provider);

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
      SS.updateKeyStatus(provider);
    }
    SS.updateModelOptions(provider);
  };

  SS.updateModelOptions = function (provider) {
    var input = document.getElementById("model-input");
    var datalist = document.getElementById("model-datalist");
    if (!input) return;
    var currentVal = input.value;
    if (datalist) datalist.innerHTML = "";
    var models = SS.modelsFor(provider);

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
      if (datalist) datalist.appendChild(opt);
    });

    var ids = models.map(function (m) { return m.id; });
    if (currentVal && ids.indexOf(currentVal) !== -1) {
      input.value = currentVal;
    } else if (!currentVal && models.length > 0) {
      input.value = models[0].id;
    }

    SS.updateModelDescription(input.value.trim(), models);
  };

  SS.updateModelDescription = function (modelId, models) {
    var infoEl = document.getElementById("model-description-info");
    if (!infoEl) {
      var input = document.getElementById("model-input");
      if (!input || !input.parentNode) return;
      infoEl = document.createElement("div");
      infoEl.id = "model-description-info";
      infoEl.className = "field-hint";
      infoEl.style.cssText = "margin-top:4px;font-size:11px;opacity:0.7;line-height:1.4;min-height:16px;";
      input.parentNode.insertBefore(infoEl, input.nextSibling);
    }
    var found = null;
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === modelId) { found = models[i]; break; }
    }
    infoEl.textContent = (found && found.description) ? found.description : "";
  };

  SS.updateKeyStatus = function (provider) {
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
  };
})();
