/**
 * Edit Provider Modal Webview Module — Modal dialog for adding/editing LLM provider configuration.
 * Fields: Provider dropdown, API Key (masked), Base URL, Model, Test Connection, Save.
 */
(function () {
  "use strict";

  // Reuse the single VS Code API instance (see provider-table.js note).
  var vscode = window.__vscodeApi || (window.__vscodeApi = acquireVsCodeApi());
  var SS = window.SettingsShared = window.SettingsShared || {};

  // Modal state
  var modalEl = null;
  var currentProviderId = null;
  var isEditing = false;
  var testInProgress = false;

  // Provider options
  var PROVIDER_OPTIONS = [
    { id: "anthropic", label: "Anthropic (Claude)", category: "cloud" },
    { id: "openai", label: "OpenAI (GPT)", category: "cloud" },
    { id: "lmstudio", label: "LM Studio (Local)", category: "local" },
    { id: "openrouter", label: "OpenRouter (Gateway)", category: "gateway" },
    { id: "ollama", label: "Ollama (Local)", category: "local" },
  ];

  // SA4E-390 UX fix: the full provider registry (~130 providers) is injected by
  // the host as window.__providerMeta ({ id: { baseUrl, local } }). These small
  // hardcoded maps are only a fallback for the handful of well-known providers.
  var PROVIDER_META = window.__providerMeta || {};

  var PROVIDER_DEFAULTS = {
    anthropic: { baseUrl: "https://api.anthropic.com" },
    openai: { baseUrl: "https://api.openai.com/v1" },
    lmstudio: { baseUrl: "http://localhost:1234/v1" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1" },
    ollama: { baseUrl: "http://localhost:11434" },
  };

  /** Default base URL for any provider id (registry first, then fallback). */
  function defaultBaseUrl(providerId) {
    var meta = PROVIDER_META[providerId];
    if (meta && meta.baseUrl) { return meta.baseUrl; }
    var fb = PROVIDER_DEFAULTS[providerId];
    return fb ? fb.baseUrl : "";
  }

  /** A provider is "local/keyless" when the registry says it needs no API key. */
  function isLocalProvider(providerId) {
    var meta = PROVIDER_META[providerId];
    if (meta) { return !!meta.local; }
    return ["lmstudio", "ollama", "onnx", "llamacpp", "vllm"].indexOf(providerId) !== -1;
  }

  /** Create the modal DOM structure. */
  function createModal() {
    modalEl = document.getElementById("provider-modal");
    if (!modalEl) {
      console.warn("[edit-provider-modal] provider-modal element not found");
      return;
    }

    bindEvents();
  }

  /** Bind event listeners. */
  function bindEvents() {
    if (!modalEl) { return; }

    var form = modalEl.querySelector("#provider-form");
    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var apiKeyInput = modalEl.querySelector("#provider-form-api-key");
    var useDefaultUrlChk = modalEl.querySelector("#provider-form-use-default-url");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var testBtn = modalEl.querySelector("#provider-test-btn");
    var cancelBtn = modalEl.querySelector("#provider-cancel-btn");
    var saveBtn = modalEl.querySelector("#provider-save-btn");
    var toggleVisibilityBtn = modalEl.querySelector("#provider-toggle-key-visibility");
    var closeBtn = modalEl.querySelector(".modal-close");

    // Provider selection change
    providerSelect?.addEventListener("change", function () {
      onProviderChange(providerSelect.value);
      validateForm();
    });

    // API key input — revalidate, and refetch models for cloud providers once
    // a key is entered (gateways need the key to return /v1/models).
    var apiKeyModelsTimer = null;
    apiKeyInput?.addEventListener("input", function () {
      validateForm();
      if (apiKeyModelsTimer) { clearTimeout(apiKeyModelsTimer); }
      apiKeyModelsTimer = setTimeout(function () {
        var pid = providerSelect && providerSelect.value;
        if (pid && apiKeyInput.value.trim().length > 0) {
          // Force a refetch: the key may unlock the provider's model list.
          lastModelsKey = null;
          requestProviderModels(pid);
        }
      }, 600);
    });

    // Use default URL checkbox
    useDefaultUrlChk?.addEventListener("change", function () {
      if (useDefaultUrlChk.checked) {
        baseUrlInput.disabled = true;
        baseUrlInput.value = defaultBaseUrl(providerSelect.value);
      } else {
        baseUrlInput.disabled = false;
        baseUrlInput.value = "";
        baseUrlInput.focus();
      }
      validateForm();
      // Base URL changed → refetch the model list from the new target server.
      lastModelsKey = null;
      requestProviderModels(providerSelect.value);
    });

    // Base URL input — refetch models when the user points at another server
    // (debounced so we don't fetch on every keystroke).
    var baseUrlModelsTimer = null;
    baseUrlInput?.addEventListener("input", function () {
      validateForm();
      if (baseUrlModelsTimer) { clearTimeout(baseUrlModelsTimer); }
      baseUrlModelsTimer = setTimeout(function () {
        if (providerSelect && providerSelect.value) {
          requestProviderModels(providerSelect.value);
        }
      }, 600);
    });

    // Model input
    modelInput?.addEventListener("input", validateForm);

    // Toggle API key visibility
    toggleVisibilityBtn?.addEventListener("click", function () {
      var isPassword = apiKeyInput.type === "password";
      apiKeyInput.type = isPassword ? "text" : "password";
      toggleVisibilityBtn.textContent = isPassword ? "🙈" : "👁️";
    });

    // Test connection button
    testBtn?.addEventListener("click", handleTestConnection);

    // Cancel button
    cancelBtn?.addEventListener("click", function () {
      hide();
    });

    // Close button
    closeBtn?.addEventListener("click", function () {
      hide();
    });

    // Form submit (Save)
    form?.addEventListener("submit", function (e) {
      e.preventDefault();
      handleSave();
    });

    // Close on backdrop click
    var backdrop = modalEl.querySelector(".modal-backdrop");
    backdrop?.addEventListener("click", function () {
      hide();
    });

    // Escape key to close
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isVisible()) {
        hide();
      }
    });
  }

  /** Handle provider change — update defaults and field visibility. */
  function onProviderChange(providerId) {
    if (!modalEl) { return; }

    var apiKeyGroup = modalEl.querySelector("#provider-form-api-key-group");
    var apiKeyRequired = modalEl.querySelector("#provider-form-api-key-group label .required");
    var apiKeyHint = modalEl.querySelector("#provider-form-api-key-hint");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var useDefaultUrlChk = modalEl.querySelector("#provider-form-use-default-url");

    var isLocal = isLocalProvider(providerId);
    var baseUrl = defaultBaseUrl(providerId);

    // Show/hide API key for local (keyless) providers
    if (isLocal) {
      apiKeyGroup.style.display = "none";
      if (apiKeyRequired) { apiKeyRequired.textContent = ""; }
    } else {
      apiKeyGroup.style.display = "";
      if (apiKeyRequired) { apiKeyRequired.textContent = "*"; }
    }

    // Update hints
    if (isLocal) {
      apiKeyHint.textContent = "Not required for local/keyless providers.";
    } else {
      apiKeyHint.textContent = "Stored securely in VS Code SecretStorage. Never displayed in plain text.";
    }

    // Prefill the default base URL when "use default" is on. Model has no
    // registry default (varies per server), so leave whatever the user typed.
    if (useDefaultUrlChk.checked && baseUrl) {
      baseUrlInput.value = baseUrl;
    }

    // SA4E-390 UX: auto-fill the Model combobox from the provider's live model
    // list (/v1/models). Ask the host; the providerModels listener populates
    // the datalist and selects the first model when the field is empty.
    requestProviderModels(providerId);

    validateForm();
  }

  /**
   * Ask the host for the provider's model list. Keyed by provider + baseUrl so
   * the list is refetched when EITHER changes — the combobox must reflect the
   * exact server the Base URL points at (not a saved setting).
   */
  var lastModelsKey = null;
  function requestProviderModels(providerId) {
    if (!providerId || !modalEl) { return; }
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var useDefaultChk = modalEl.querySelector("#provider-form-use-default-url");
    // When "use default" is on, send no override (host resolves the default);
    // otherwise send the typed Base URL so the fetch targets that server.
    var baseUrl = (useDefaultChk && useDefaultChk.checked)
      ? (baseUrlInput ? baseUrlInput.value.trim() : "")
      : (baseUrlInput ? baseUrlInput.value.trim() : "");
    var key = providerId + "|" + baseUrl;
    if (key === lastModelsKey) { return; }
    lastModelsKey = key;
    var hint = modalEl.querySelector("#provider-form-model-hint");
    if (hint) { hint.textContent = "Loading models\u2026"; }
    vscode.postMessage({ type: "getProviderModels", provider: providerId, baseUrl: baseUrl });
  }

  /** Populate the Model datalist and auto-select when empty. */
  function applyProviderModels(models) {
    if (!modalEl) { return; }
    var datalist = modalEl.querySelector("#provider-form-model-list");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var hint = modalEl.querySelector("#provider-form-model-hint");
    var list = Array.isArray(models) ? models : [];
    if (datalist) {
      datalist.innerHTML = list
        .map(function (m) { return '<option value="' + (m.id || m) + '"></option>'; })
        .join("");
    }
    if (hint) {
      hint.textContent = list.length
        ? (list.length + " model(s) found \u2014 type or pick one")
        : "No models reported by the server \u2014 type the model id manually";
    }
    // Auto-fill: only when the user has not typed a model yet.
    if (modelInput && !modelInput.value.trim() && list.length) {
      modelInput.value = list[0].id || list[0];
      validateForm();
    }
  }

  /** Validate form and enable/disable save button. */
  function validateForm() {
    if (!modalEl) { return; }

    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var apiKeyInput = modalEl.querySelector("#provider-form-api-key");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var saveBtn = modalEl.querySelector("#provider-save-btn");

    var providerId = providerSelect.value;
    var isLocal = isLocalProvider(providerId);
    var hasProvider = !!providerId;
    var hasApiKey = isLocal || (apiKeyInput.value.trim().length > 0);
    var hasModel = modelInput.value.trim().length > 0;
    var hasValidUrl = !baseUrlInput.value.trim() || isValidUrl(baseUrlInput.value.trim());

    // Show/hide errors
    toggleError("provider-form-provider", !hasProvider, "Please select a provider");
    toggleError("provider-form-api-key", !isLocal && !hasApiKey, "API key is required for this provider");
    toggleError("provider-form-model", !hasModel, "Model ID is required");
    toggleError("provider-form-base-url", baseUrlInput.value.trim() && !hasValidUrl, "Invalid URL format");

    // Enable save button when all required fields are valid
    saveBtn.disabled = !(hasProvider && hasApiKey && hasModel && hasValidUrl);
  }

  /** Toggle error message visibility. */
  function toggleError(inputId, show, message) {
    if (!modalEl) { return; }
    var input = modalEl.querySelector("#" + inputId);
    var errorEl = input?.parentElement?.querySelector(".field-error") || modalEl.querySelector("#" + inputId + "-error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !show;
    }
    if (input) {
      input.setAttribute("aria-invalid", show ? "true" : "false");
    }
  }

  /** Validate URL format. */
  function isValidUrl(url) {
    try {
      var parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /** Handle Test Connection button click. */
  async function handleTestConnection() {
    if (!modalEl || testInProgress) { return; }

    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var testBtn = modalEl.querySelector("#provider-test-btn");
    var statusEl = modalEl.querySelector(".modal-status") || createStatusEl();

    var providerId = providerSelect.value;
    var baseUrl = baseUrlInput.value.trim() || undefined;
    var model = modelInput ? modelInput.value.trim() : "";

    if (!providerId) {
      showStatus("Please select a provider first", "error");
      return;
    }
    // The end-to-end probe sends a real completion, so the model is required —
    // without it a local server (LM Studio / llama-server) returns 400
    // "No models loaded" (param: model).
    if (!model) {
      showStatus("Enter a Model id before testing", "error");
      return;
    }

    testInProgress = true;
    testBtn.disabled = true;
    testBtn.classList.add("loading");
    // Keep "Testing..." until the host replies with profileTested — the
    // message listener (below) writes the real success/failure result.
    showStatus("Testing connection...", "info");

    // The profileTested listener resets testInProgress/testBtn on reply.
    vscode.postMessage({
      type: "testProfileConnection",
      profileId: "modal-test-" + Date.now(),
      provider: providerId,
      baseUrl: baseUrl,
      model: model,
      isTemp: true,
    });
  }

  /** Handle Save button click. */
  async function handleSave() {
    if (!modalEl) { return; }

    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var apiKeyInput = modalEl.querySelector("#provider-form-api-key");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var modelInput = modalEl.querySelector("#provider-form-model");
    var saveBtn = modalEl.querySelector("#provider-save-btn");

    var providerId = providerSelect.value;
    var apiKey = apiKeyInput.value.trim();
    var baseUrl = baseUrlInput.value.trim();
    var model = modelInput.value.trim();

    if (!providerId || (!isLocalProvider(providerId) && !apiKey) || !model) {
      validateForm();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.classList.add("loading");

    var formData = { providerId: providerId, apiKey: apiKey, baseUrl: baseUrl, model: model };

    // Send to extension host
    vscode.postMessage({
      type: "saveProfile",
      payload: {
        id: providerId + "-" + model,
        label: getProviderLabel(providerId) + " - " + model,
        provider: providerId,
        baseUrl: baseUrl || undefined,
        model: model,
        useDefaultUrl: !baseUrl,
        apiKey: apiKey,
      },
    });

    // Modal will close on profileAdded/profileEdited response
  }

  /** Show status message in modal. */
  function showStatus(message, type) {
    if (!modalEl) { return; }
    var statusEl = modalEl.querySelector(".modal-status") || createStatusEl();
    statusEl.textContent = message;
    statusEl.className = "modal-status " + type;
    statusEl.hidden = false;
  }

  /** Create status element if not exists. */
  function createStatusEl() {
    var footer = modalEl.querySelector(".modal-footer");
    var statusEl = document.createElement("div");
    statusEl.className = "modal-status hidden";
    footer.parentNode.insertBefore(statusEl, footer);
    return statusEl;
  }

  /** Clear status message. */
  function clearStatus() {
    if (!modalEl) { return; }
    var statusEl = modalEl.querySelector(".modal-status");
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.className = "modal-status";
      statusEl.hidden = true;
    }
  }

  /** Get provider label. */
  function getProviderLabel(providerId) {
    var labels = {
      anthropic: "Anthropic",
      openai: "OpenAI",
      lmstudio: "LM Studio",
      openrouter: "OpenRouter",
      ollama: "Ollama",
      onnx: "ONNX",
    };
    return labels[providerId] || providerId;
  }

  /** Show modal for adding a new provider. */
  function showForAdd() {
    isEditing = false;
    currentProviderId = null;
    resetForm();
    updateTitle("Add Provider");
    show();
  }

  /** Show modal for editing an existing provider. */
  function showForEdit(profileId, formData) {
    isEditing = true;
    currentProviderId = profileId;
    populateForm(formData);
    updateTitle("Edit Provider");
    show();
  }

  /** Reset form to defaults. */
  function resetForm() {
    if (!modalEl) { return; }

    var form = modalEl.querySelector("#provider-form");
    form.reset();

    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var useDefaultUrlChk = modalEl.querySelector("#provider-form-use-default-url");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var apiKeyInput = modalEl.querySelector("#provider-form-api-key");
    var toggleBtn = modalEl.querySelector("#provider-toggle-key-visibility");

    providerSelect.value = "";
    useDefaultUrlChk.checked = true;
    baseUrlInput.disabled = true;
    baseUrlInput.value = "";
    apiKeyInput.type = "password";
    toggleBtn.textContent = "👁️";

    onProviderChange("");
    clearStatus();
  }

  /** Populate form with existing provider data. */
  function populateForm(formData) {
    if (!modalEl) { return; }

    var providerSelect = modalEl.querySelector("#provider-form-provider");
    var apiKeyInput = modalEl.querySelector("#provider-form-api-key");
    var useDefaultUrlChk = modalEl.querySelector("#provider-form-use-default-url");
    var baseUrlInput = modalEl.querySelector("#provider-form-base-url");
    var modelInput = modalEl.querySelector("#provider-form-model");

    providerSelect.value = formData.providerId || "";
    modelInput.value = formData.model || "";

    // API key - show masked
    if (formData.apiKey) {
      apiKeyInput.value = "●".repeat(20);
      apiKeyInput.dataset.hasKey = "true";
    } else {
      apiKeyInput.value = "";
      apiKeyInput.dataset.hasKey = "false";
    }

    // Base URL
    if (formData.baseUrl) {
      useDefaultUrlChk.checked = false;
      baseUrlInput.disabled = false;
      baseUrlInput.value = formData.baseUrl;
    } else {
      useDefaultUrlChk.checked = true;
      baseUrlInput.disabled = true;
      baseUrlInput.value = defaultBaseUrl(formData.providerId || "");
    }

    onProviderChange(formData.providerId || "");
    clearStatus();
  }

  /** Update modal title. */
  function updateTitle(title) {
    if (!modalEl) { return; }
    var titleEl = modalEl.querySelector("#provider-modal-title");
    if (titleEl) { titleEl.textContent = title; }
  }

  /** Show the modal. */
  function show() {
    // Allow the Model list to refetch for whatever provider is shown next.
    lastModelsKey = null;
    modalEl?.classList.remove("hidden");
    // If a provider is already selected (edit mode / prefilled add), fetch its
    // models now so the Model combobox is populated on open.
    var providerSelect = modalEl?.querySelector("#provider-form-provider");
    if (providerSelect && providerSelect.value) {
      requestProviderModels(providerSelect.value);
    }
    setTimeout(function () {
      providerSelect?.focus();
    }, 50);
  }

  /** Hide the modal. */
  function hide() {
    modalEl?.classList.add("hidden");
    clearStatus();
  }

  /** Check if modal is visible. */
  function isVisible() {
    return !modalEl?.classList.contains("hidden");
  }

  /** Reset the Save button out of its loading state. */
  function resetSaveButton() {
    if (!modalEl) { return; }
    var saveBtn = modalEl.querySelector("#provider-save-btn");
    if (saveBtn) {
      saveBtn.classList.remove("loading");
      // Re-validate so Save re-enables only when the form is still valid.
      validateForm();
    }
  }

  // Handle host responses. handleSave() posts saveProfile and leaves the Save
  // button spinning — WITHOUT this listener the button spun forever (the UAT
  // "Save does nothing" bug). Close on success, surface the error otherwise.
  window.addEventListener("message", function (event) {
    var msg = event.data || {};
    switch (msg.type) {
      case "profileAdded":
      case "profileEdited":
        resetSaveButton();
        if (msg.success) {
          hide();
        } else if (isVisible()) {
          showStatus("\u274C " + (msg.error || "Save failed"), "error");
        }
        break;
      case "providerModels":
        // SA4E-390 UX: fill the Model combobox from the provider's live list.
        applyProviderModels(msg.models);
        break;
      case "profileTestStarted":
        // Host acknowledged the test began — keep the spinner (handled below).
        break;
      case "profileTested": {
        // Ad-hoc test result for the modal's own Test Connection button.
        testInProgress = false;
        var tBtn = modalEl && modalEl.querySelector("#provider-test-btn");
        if (tBtn) { tBtn.disabled = false; tBtn.classList.remove("loading"); }
        if (isVisible()) {
          showStatus(
            msg.success ? "\u2705 Connection OK" : ("\u274C " + (msg.error || msg.message || "Connection failed")),
            msg.success ? "success" : "error"
          );
        }
        break;
      }
    }
  });

  // Expose to SettingsShared for other modules
  SS.editProviderModal = {
    showForAdd: showForAdd,
    showForEdit: showForEdit,
    hide: hide,
    isVisible: isVisible,
  };

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createModal);
  } else {
    createModal();
  }
})();