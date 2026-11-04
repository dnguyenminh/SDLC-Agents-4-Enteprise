/**
 * Settings Panel — Apply Extension State to Form
 * handleState (full form restore from the "state" message) and handleModels
 * (per-provider model catalog application). Exposed on window.SettingsShared
 * and dispatched by settings-messages.js.
 */
(function () {
  "use strict";
  var SS = window.SettingsShared;

  var providerSelect = SS.providerSelect;
  var modelInput = SS.modelInput;
  var ollamaModelInput = SS.ollamaModelInput;
  var baseUrlInput = SS.baseUrlInput;
  var useDefaultUrlChk = SS.useDefaultUrlChk;
  var defaultUrls = SS.defaultUrls;
  var ollamaUrlInput = SS.ollamaUrlInput;
  var backendUrlInput = SS.backendUrlInput;
  var mcpPortInput = SS.mcpPortInput;
  var enableMcpChk = SS.enableMcpChk;
  var allowInsecureChk = SS.allowInsecureChk;
  var allowInsecureWarning = SS.allowInsecureWarning;
  var pegaEndpointInput = SS.pegaEndpointInput;
  var pegaUsernameInput = SS.pegaUsernameInput;
  var pegaPasswordInput = SS.pegaPasswordInput;
  var atlassianUrlInput = SS.atlassianUrlInput;
  var atlassianEmailInput = SS.atlassianEmailInput;
  var atlassianTokenInput = SS.atlassianTokenInput;
  var savedState = SS.savedState;
  var modelsByProvider = SS.modelsByProvider;
  var defaultModelByProvider = SS.defaultModelByProvider;

  function handleState(msg) {
    SS.currentProvider = msg.provider;
    savedState.hasAnthropicKey = msg.hasAnthropicKey;
    savedState.hasOpenaiKey = msg.hasOpenaiKey;

    // SA4E-390: the legacy single-provider LLM controls were removed from the
    // LLM tab (replaced by the Provider Table). Guard every legacy-DOM write so
    // the shared "state" message still restores Server/Pega/Atlassian fields.
    if (providerSelect) {
      providerSelect.value = msg.provider;
      if (SS.updateModelOptions) { SS.updateModelOptions(msg.provider); }
      if (msg.model && modelInput) { modelInput.value = msg.model; }
      if (msg.model && ollamaModelInput) { ollamaModelInput.value = msg.model; }

      if (baseUrlInput) {
        baseUrlInput.value = msg.baseUrl || "";
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
        var s = SS.getProviderState(msg.provider);
        s.useDefaultUrl = useDefaultUrlChk.checked;
        s.baseUrl = baseUrlInput.value;
        s.model = msg.model || "";
      }
    }

    if (ollamaUrlInput) { ollamaUrlInput.value = msg.ollamaUrl || "http://localhost:11434"; }

    if (msg.backendUrl !== undefined) {
      backendUrlInput.value = msg.backendUrl;
    }
    if (msg.mcpServerPort !== undefined) {
      mcpPortInput.value = String(msg.mcpServerPort);
    }
    if (msg.enableMcpServer !== undefined) {
      enableMcpChk.checked = msg.enableMcpServer;
    }
    // SA4E-320 — restore HTTPS bypass checkbox + warning visibility
    if (msg.allowInsecureRemote !== undefined) {
      allowInsecureChk.checked = msg.allowInsecureRemote;
      allowInsecureWarning.hidden = !msg.allowInsecureRemote;
    }
    // Load Pega config
    if (msg.pegaEndpoint !== undefined && pegaEndpointInput) {
      pegaEndpointInput.value = msg.pegaEndpoint;
    }
    if (msg.pegaUsername !== undefined && pegaUsernameInput) {
      pegaUsernameInput.value = msg.pegaUsername;
    }
    if (msg.hasPegaPassword && pegaPasswordInput) {
      pegaPasswordInput.placeholder = "•••••••• (Saved)";
    }

    // Load Atlassian config
    if (msg.atlassianBaseUrl !== undefined && atlassianUrlInput) {
      atlassianUrlInput.value = msg.atlassianBaseUrl;
    }
    if (msg.atlassianEmail !== undefined && atlassianEmailInput) {
      atlassianEmailInput.value = msg.atlassianEmail;
    }
    if (msg.hasAtlassianToken && atlassianTokenInput) {
      atlassianTokenInput.placeholder = "•••••••• (Saved)";
    }
    if (msg.atlassianConnectionType) {
      const radio = document.querySelector('input[name="atlassian-type"][value="' + msg.atlassianConnectionType + '"]');
      if (radio) { radio.checked = true; }
    }

    // SA4E-390: updateSections belonged to the removed single-provider module.
    if (SS.updateSections) { SS.updateSections(msg.provider); }
  }

  function handleModels(msg) {
    modelsByProvider[msg.provider] = msg.models || [];
    if (typeof msg.defaultModel === "string") {
      defaultModelByProvider[msg.provider] = msg.defaultModel;
    }
    // SA4E-390: legacy single-provider model catalog UI removed — the Provider
    // Table owns model display now. Guard so a stray "models" message is a no-op.
    if (msg.provider === SS.currentProvider && SS.updateModelOptions) {
      SS.updateModelOptions(msg.provider);
      if (msg.selected) {
        var input = document.getElementById("model-input");
        if (input) {
          input.value = msg.selected;
          if (SS.updateModelDescription) { SS.updateModelDescription(msg.selected, msg.models || []); }
        }
      }
      if (SS.currentProvider !== "ollama" && modelInput) {
        modelInput.placeholder = SS.defaultModelFor(SS.currentProvider);
      }
    }
  }

  SS.handleState = handleState;
  SS.handleModels = handleModels;
})();
