/**
 * Chat Panel — Model Picker Popup (SA4E-390)
 * Replaces the simple dropdown with a full-featured picker:
 * - Search field (real-time filter)
 * - Recent section (recently used models)
 * - Model list: name + provider + Free badge
 * - Keyboard shortcuts: Esc (close), Ctrl+A (connect integration), Ctrl+F (focus search)
 */
(function () {
  "use strict";

  var S = window.ChatState = window.ChatState || {};

  var vscode = S.vscode;
  var modelBtn = S.modelBtn;
  var modelLabel = S.modelLabel;
  var modelDropdown = S.modelDropdown; // Kept for backward compat, now hidden
  var contextMenu = S.contextMenu;

  // Model picker popup reference
  var modelPicker = null;
  var isPickerInitialized = false;

  // Provider display labels
  var PROVIDER_LABELS = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    lmstudio: "LM Studio",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    onnx: "ONNX (Local)",
  };

  /** Initialize the model picker popup. */
  function initModelPicker() {
    if (isPickerInitialized) { return; }
    isPickerInitialized = true;

    // Create the model picker popup
    if (S.modelPicker && S.modelPicker.createPopup) {
      S.modelPicker.createPopup();
      modelPicker = S.modelPicker;
    } else {
      console.warn("[chat-model] modelPicker not available, ensure model-picker-popup.js loads first");
    }
  }

  /** Handle model selector button click. */
  function handleModelBtnClick(e) {
    e.stopPropagation();
    contextMenu?.classList.add("hidden");

    if (!modelPicker) {
      initModelPicker();
    }

    if (modelPicker) {
      // Fetch fresh model groups from extension
      vscode.postMessage({ type: "chat:getModelPickerGroups" });
    }
  }

  /** Open the model picker with grouped data. */
  function openModelPicker(groups, selectedModel, selectedProfileId) {
    if (!modelPicker) { return; }

    // Convert grouped data to flat model list for picker
    var allModels = [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var providerLabel = PROVIDER_LABELS[group.provider] || group.provider;
      for (var i = 0; i < group.items.length; i++) {
        var item = group.items[i];
        allModels.push({
          id: item.modelId,
          name: item.modelName,
          provider: providerLabel,
          providerId: group.provider,
          isFree: item.isFree,
          rateMultiplier: item.isFree ? 0 : 1,
          profileId: item.profileId,
        });
      }
    }

    modelPicker.setModels(allModels);
    modelPicker.open(modelBtn);
  }

  /** Close the model picker. */
  function closeModelPicker() {
    if (modelPicker) {
      modelPicker.close();
    }
  }

  /** Handle model selection from picker. */
  function onModelSelect(model) {
    // Send message to extension: switch profile + model in ONE operation
    vscode.postMessage({
      type: "chat:setModelAndProfile",
      profileId: model.profileId,
      model: model.id,
    });
    closeModelPicker();
  }

  /** Update model button label from current selection. */
  function updateModelLabel(model, profileId, groups) {
    var label = "Auto";
    if (model === "auto") {
      label = "Auto";
    } else {
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        for (var i = 0; i < group.items.length; i++) {
          var item = group.items[i];
          if (item.modelId === model && item.profileId === profileId) {
            label = item.modelName + (item.isFree ? " (Free)" : "");
            break;
          }
        }
        if (label !== "Auto") { break; }
      }
      // Fallback: use model ID
      if (label === "Auto" && model !== "auto") {
        label = model;
      }
    }
    if (modelLabel) {
      modelLabel.textContent = label;
    }
    if (modelBtn) {
      modelBtn.title = model + (profileId ? " (" + profileId + ")" : "");
    }
  }

  // === Event Listeners ===

  // Model button click
  if (modelBtn) {
    modelBtn.addEventListener("click", handleModelBtnClick);
  }

  // Close on outside click (for backward compat with dropdown)
  document.addEventListener("click", function (e) {
    if (modelPicker && modelPicker.isVisible()) {
      var pickerEl = modelPicker.popupEl || document.querySelector(".model-picker-popup");
      if (pickerEl && !pickerEl.contains(e.target) && e.target !== modelBtn) {
        closeModelPicker();
      }
    }
    // Also close legacy dropdown
    if (modelDropdown && !modelDropdown.classList.contains("hidden") &&
        !modelDropdown.contains(e.target) && e.target !== modelBtn) {
      modelDropdown.classList.add("hidden");
    }
  });

  // Escape key closes picker (handled by model picker's keyboard handler)

  // === Message Handlers ===

  var originalOnMessage = S.onMessage || function () {};
  S.onMessage = function (msg) {
    if (msg.type === "modelPickerGroups") {
      // Open picker with grouped data
      initModelPicker();
      openModelPicker(msg.groups, S.currentModel, S.currentProfileId);
    } else if (msg.type === "chat:models") {
      // Legacy model list - still support for backward compat
      S.availableModels = msg.models;
      S.supportsAuto = msg.supportsAuto;
      S.currentModel = msg.selected;
      // Also fetch grouped picker data for the new picker
      vscode.postMessage({ type: "chat:getModelPickerGroups" });
    } else if (msg.type === "chat:modelAndProfileSet") {
      // Extension confirms the switch
      S.currentModel = msg.model;
      S.currentProfileId = msg.profileId;
      // Re-fetch groups to update label
      vscode.postMessage({ type: "chat:getModelPickerGroups" });
    }
    originalOnMessage(msg);
  };

  // Expose update function for external use
  S.updateModelLabel = updateModelLabel;

  // Initialize model picker when chat panel loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModelPicker);
  } else {
    initModelPicker();
  }

})();