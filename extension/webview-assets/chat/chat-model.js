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
  modelBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    modelDropdown.classList.toggle("hidden");
    contextMenu.classList.add("hidden");
  });

  // Delegate clicks on dynamically-rendered model buttons.
  modelDropdown.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-model]") : null;
    if (!btn) return;
    var model = btn.getAttribute("data-model");
    S.setModel(model);
    modelDropdown.classList.add("hidden");
    vscode.postMessage({ type: "chat:setModel", model: model });
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
    if (model === "auto") return "Auto";
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

  S.setModel = function (model) {
    S.currentModel = model;
    modelLabel.textContent = labelForModel(model);
    // Set full model path as tooltip for hover display
    modelBtn.title = model;
    var allBtns = modelDropdown.querySelectorAll("button");
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].classList.toggle("active", allBtns[i].getAttribute("data-model") === model);
    }
  };
})();
