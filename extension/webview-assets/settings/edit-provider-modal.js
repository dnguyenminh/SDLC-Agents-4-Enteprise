/**
 * Edit Provider Modal Webview Module — Modal dialog for adding/editing LLM provider configuration.
 * Fields: Provider dropdown, API Key (masked), Base URL, Model, Test Connection, Save.
 */
(function () {
  "use strict";

  var vscode = acquireVsCodeApi();
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

  var PROVIDER_DEFAULTS = {
    anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-sonnet" },
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
    lmstudio: { baseUrl: "http://localhost:1234/v1", model: "qwen2-7b-instruct" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter-mixtral" },
    ollama: { baseUrl: "http://localhost:11434", model: "llama3" },
  };

  var LOCAL_PROVIDERS = ["lmstudio", "ollama", "onnx"];

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

    // API key input
    apiKeyInput?.addEventListener("input", validateForm);

    // Use default URL checkbox
    useDefaultUrlChk?.addEventListener("change", function () {
      if (useDefaultUrlChk.checked) {
        baseUrlInput.disabled = true;
        var providerId = providerSelect.value;
        var defaults = PROVIDER_DEFAULTS[providerId];
        baseUrlInput.value = defaults?.baseUrl || "";
      } else {
        baseUrlInput.disabled = false;
        baseUrlInput.value = "";
        baseUrlInput.focus();
      }
      validateForm();
    });

    // Base URL input
    baseUrlInput?.addEventListener("input", validateForm);

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

    var isLocal = LOCAL_PROVIDERS.includes(providerId);
    var defaults = PROVIDER_DEFAULTS[providerId];

    // Show/hide API key for local providers
    if (isLocal) {
      apiKeyGroup.style.display = "none";
      if (apiKeyRequired) { apiKeyRequired.textContent = ""; }
    } else {
      apiKeyGroup.style.display = "";
      if (apiKeyRequired) { apiKeyRequired.textContent = "*"; }
    }

    // Update hints
    if (providerId === "lmstudio") {
      apiKeyHint.textContent = "Optional for LM Studio (local server typically doesn't require auth)";
    } else if (providerId === "ollama") {
      apiKeyHint.textContent = "Not required for Ollama (local server)";
    } else {
      apiKeyHint.textContent = "Stored securely in VS Code SecretStorage. Never displayed in plain text.";
    }

    // Update defaults
    if (defaults) {
      if (useDefaultUrlChk.checked) {
        baseUrlInput.value = defaults.baseUrl;
      }
      if (!modelInput.value) {
        modelInput.value = defaults.model;
      }
    }

    validateForm();
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
    var isLocal = LOCAL_PROVIDERS.includes(providerId);
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
    var testBtn = modalEl.querySelector("#provider-test-btn");
    var statusEl = modalEl.querySelector(".modal-status") || createStatusEl();

    var providerId = providerSelect.value;
    var baseUrl = baseUrlInput.value.trim() || undefined;

    if (!providerId) {
      showStatus("Please select a provider first", "error");
      return;
    }

    testInProgress = true;
    testBtn.disabled = true;
    testBtn.classList.add("loading");
    showStatus("Testing connection...", "info");

    try {
      vscode.postMessage({
        type: "testProfileConnection",
        profileId: "modal-test-" + Date.now(),
        provider: providerId,
        baseUrl: baseUrl,
        isTemp: true,
      });
      showStatus("✅ Connection test sent", "success");
    } catch (err) {
      showStatus("❌ " + (err.message || "Connection test failed"), "error");
    } finally {
      testInProgress = false;
      testBtn.disabled = false;
      testBtn.classList.remove("loading");
    }
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

    if (!providerId || (!LOCAL_PROVIDERS.includes(providerId) && !apiKey) || !model) {
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
      var defaults = PROVIDER_DEFAULTS[formData.providerId || ""];
      baseUrlInput.value = defaults?.baseUrl || "";
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
    modalEl?.classList.remove("hidden");
    setTimeout(function () {
      var providerSelect = modalEl?.querySelector("#provider-form-provider");
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