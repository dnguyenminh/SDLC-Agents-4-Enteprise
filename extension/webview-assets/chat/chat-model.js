/**
 * Chat Panel — Model Selector (KSA-237)
 * Model dropdown rendering (name + rate badge), label resolution with
 * local-model path shortening, selection handling. Reads/writes
 * window.ChatState (availableModels, supportsAuto, currentModel).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var modelBtn = S.modelBtn;
  var modelLabel = S.modelLabel;
  var modelDropdown = S.modelDropdown;
  var contextMenu = S.contextMenu;

  // Available models are populated dynamically from the extension
  // (chat:models message) based on the configured SDLC provider.

  // === Model Selector ===
  // SA4E-390 AC6: open the full Model Picker popup (search / recent / grouped
  // list / Free badge) when available; fall back to the legacy inline dropdown.
  modelBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    contextMenu.classList.add("hidden");
    if (S.modelPicker) {
      if (!S._modelPickerCreated) {
        S.modelPicker.createPopup();
        S._modelPickerCreated = true;
      }
      S.modelPicker.setModels(buildPickerModels());
      S.modelPicker.open(modelBtn);
      return;
    }
    modelDropdown.classList.toggle("hidden");
  });

  /**
   * Shape S.availableModels for the picker: it groups by provider and shows a
   * Free badge, so ensure provider + isFree are present (derived from the
   * active provider + rateMultiplier when the host did not supply them).
   */
  function buildPickerModels() {
    var provider = S.currentProvider || "";
    var list = [];
    for (var i = 0; i < S.availableModels.length; i++) {
      var m = S.availableModels[i];
      list.push({
        id: m.id,
        name: m.name || m.id,
        provider: m.provider || provider,
        providerId: m.providerId || provider,
        isFree: m.isFree === true || m.rateMultiplier === 0,
        rateMultiplier: m.rateMultiplier,
      });
    }
    return list;
  }
  // Expose so chat-inbox.js can refresh the picker when chat:models arrives.
  S.buildPickerModels = buildPickerModels;

  // Delegate clicks on dynamically-rendered model buttons.
  modelDropdown.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-model]") : null;
    if (!btn) return;
    var model = btn.getAttribute("data-model");
    S.setModel(model);
    modelDropdown.classList.add("hidden");
    // Explicit user pick → host updates this tab's peer capability.
    vscode.postMessage({ type: "chat:setModel", model: model, explicit: true });
  });

  S.renderModelDropdown = function () {
    modelDropdown.innerHTML = "";
    if (S.supportsAuto) {
      modelDropdown.appendChild(makeModelButton({ id: "auto", name: "Auto" }));
    }
    for (var i = 0; i < S.availableModels.length; i++) {
      modelDropdown.appendChild(makeModelButton(S.availableModels[i]));
    }
    // Reflect current selection
    var allBtns = modelDropdown.querySelectorAll("button");
    for (var j = 0; j < allBtns.length; j++) {
      allBtns[j].classList.toggle("active", allBtns[j].getAttribute("data-model") === S.currentModel);
    }
  };

  function makeModelButton(model) {
    var btn = document.createElement("button");
    btn.setAttribute("data-model", model.id);
    // KSA-237: render name + rate badge like Kiro IDE
    var nameSpan = document.createElement("span");
    nameSpan.className = "model-item-name";
    nameSpan.textContent = model.name;
    btn.appendChild(nameSpan);

    if (typeof model.rateMultiplier === "number") {
      var badge = document.createElement("span");
      badge.className = "model-rate-badge";
      if (model.rateMultiplier === 0) {
        badge.textContent = "Free";
        badge.classList.add("rate-free");
      } else {
        badge.textContent = model.rateMultiplier + (model.rateMultiplier === 1 ? " Credit" : " Credits");
      }
      btn.appendChild(badge);
    }

    if (model.description) {
      var desc = document.createElement("span");
      desc.className = "model-item-desc";
      desc.textContent = model.description;
      btn.appendChild(desc);
    }

    return btn;
  }

  function labelForModel(model) {
    // SA4E-391: "auto" is resolved by the LLM server per request — we cannot
    // know the concrete model locally, so label it clearly as server-routed.
    if (model === "auto") return "Auto (server-routed)";
    for (var i = 0; i < S.availableModels.length; i++) {
      if (S.availableModels[i].id === model) {
        var lbl = S.availableModels[i].name;
        // KSA-237: show compact rate in the button label
        if (typeof S.availableModels[i].rateMultiplier === "number" && S.availableModels[i].rateMultiplier !== 1) {
          if (S.availableModels[i].rateMultiplier === 0) {
            lbl += " (Free)";
          } else {
            lbl += " (" + S.availableModels[i].rateMultiplier + "x)";
          }
        }
        return lbl;
      }
    }
    // For local models with long paths, extract just the filename
    var shortName = model;
    if (model.indexOf("/") !== -1 || model.indexOf("\\") !== -1) {
      var parts = model.replace(/\\/g, "/").split("/");
      shortName = parts[parts.length - 1] || parts[parts.length - 2] || model;
    }
    // Remove .gguf extension for cleaner display
    shortName = shortName.replace(/\.gguf$/i, "");
    return shortName;
  }

  /**
   * Update the model UI + global current model. `persistToTab` (default true)
   * stores the choice on the ACTIVE tab so each tab remembers its own model
   * (SA4E-391 per-tab model). System-driven calls (chat:models/configUpdate on
   * init) pass false to avoid clobbering a tab that already has a saved model.
   */
  S.setModel = function (model, persistToTab) {
    S.currentModel = model;
    if (persistToTab !== false) {
      var tab = S.getTab(S.activeTabId);
      if (tab) tab.model = model;
    }
    modelLabel.textContent = labelForModel(model);
    // Tooltip: explain "auto" (server picks the concrete model each turn);
    // otherwise show the full model id/path on hover.
    modelBtn.title = (model === "auto")
      ? "Auto — the LLM server chooses the concrete model for each request. Pick a specific model to control it."
      : model;
    var allBtns = modelDropdown.querySelectorAll("button");
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].classList.toggle("active", allBtns[i].getAttribute("data-model") === model);
    }
  };

  /**
   * Apply the active tab's saved model to the UI + host. Called on tab switch:
   * each tab drives the single host engine config while it is active, so the
   * host always uses the viewed tab's model. Falls back to the current global
   * model when the tab has no saved choice yet.
   */
  S.applyTabModel = function (tab) {
    if (!tab) return;
    var model = tab.model || S.currentModel || "auto";
    if (!tab.model) tab.model = model;
    S.setModel(model, false);
    // SA4E-391: a tab SWITCH tells the host which model is active for the next
    // turn, but it must NOT rewrite the switched tab's peer capability — a
    // passive switch sending "auto" was clobbering a tab's picked vision model
    // in the registry. `explicit:false` → host updates engine model only.
    vscode.postMessage({ type: "chat:setModel", model: model, explicit: false });
  };

  /** Seed the active tab's model if it has none yet (never overwrites). */
  S.seedActiveTabModel = function (model) {
    var tab = S.getTab(S.activeTabId);
    if (tab && !tab.model && model) tab.model = model;
  };
})();
