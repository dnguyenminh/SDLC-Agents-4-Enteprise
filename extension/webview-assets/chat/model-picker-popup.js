/**
 * Model Picker Popup — Replaces the simple model dropdown in Chat panel.
 * Features: Search filter, Recent section, Model list with name/provider/Free badge.
 * Keyboard shortcuts: Esc (close), Ctrl+A (connect integration), Ctrl+F (focus search).
 */
(function () {
  "use strict";

  var SS = window.ChatState = window.ChatState || {};

  // State
  var allModels = [];
  var filteredModels = [];
  var recentModels = [];
  var searchQuery = "";
  var isOpen = false;
  var popupEl = null;
  var keyboardHandler = null;

  // Constants
  var PROVIDER_LABELS = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    lmstudio: "LM Studio",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    onnx: "ONNX",
  };

  var MAX_RECENT_MODELS = 5;
  var RECENT_STORAGE_KEY = "sdlcAgents.modelPicker.recent";

  /** Create the popup DOM structure. */
  function createPopup() {
    popupEl = document.createElement("div");
    popupEl.className = "model-picker-popup hidden";
    popupEl.setAttribute("role", "dialog");
    popupEl.setAttribute("aria-modal", "true");
    popupEl.setAttribute("aria-label", "Select LLM Model");
    popupEl.innerHTML = getPopupHtml();
    document.body.appendChild(popupEl);
    bindEvents();
  }

  /** Get the popup HTML template. */
  function getPopupHtml() {
    return "\
      <div class=\"model-picker-backdrop\" data-action=\"close\"></div>\n\
      <div class=\"model-picker-dialog\" role=\"document\">\n\
        <div class=\"model-picker-header\">\n\
          <h3>Select Model</h3>\n\
          <button class=\"picker-close-btn\" aria-label=\"Close\" data-action=\"close\">&times;</button>\n\
        </div>\n\
\n\
        <div class=\"model-picker-search\">\n\
          <label for=\"picker-search\" class=\"visually-hidden\">Search models</label>\n\
          <input type=\"text\" id=\"picker-search\" placeholder=\"Search models...\" autocomplete=\"off\" aria-describedby=\"search-hint\">\n\
          <span id=\"search-hint\" class=\"visually-hidden\">Press Ctrl+F to focus search, Esc to close</span>\n\
        </div>\n\
\n\
        <div class=\"model-picker-content\">\n\
          <div class=\"model-picker-recent\" id=\"picker-recent\" hidden>\n\
            <h4>Recent</h4>\n\
            <div class=\"model-list\" id=\"recent-model-list\"></div>\n\
          </div>\n\
\n\
          <div class=\"model-picker-models\">\n\
            <h4>Models</h4>\n\
            <div class=\"model-list\" id=\"model-list\"></div>\n\
            <div class=\"empty-state\" id=\"empty-state\" hidden>\n\
              <p>No models available</p>\n\
              <p class=\"hint\">Configure a provider in Settings first</p>\n\
            </div>\n\
          </div>\n\
        </div>\n\
\n\
        <div class=\"model-picker-footer\">\n\
          <kbd class=\"shortcut-hint\"><kbd>Esc</kbd> Close</kbd>\n\
          <kbd class=\"shortcut-hint\"><kbd>Ctrl</kbd>+<kbd>A</kbd> Connect Integration</kbd>\n\
          <kbd class=\"shortcut-hint\"><kbd>Ctrl</kbd>+<kbd>F</kbd> Focus Search</kbd>\n\
        </div>\n\
      </div>";
  }

  /** Bind event listeners. */
  function bindEvents() {
    if (!popupEl) { return; }

    var searchInput = popupEl.querySelector("#picker-search");
    var closeBtn = popupEl.querySelector("[data-action='close']");
    var backdrop = popupEl.querySelector(".model-picker-backdrop");

    // Search input with debounce
    var searchTimeout;
    searchInput?.addEventListener("input", function (e) {
      var target = e.target;
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function () {
        searchQuery = target.value.trim().toLowerCase();
        filterModels();
      }, 100);
    });

    // Close button
    closeBtn?.addEventListener("click", close);

    // Backdrop click
    backdrop?.addEventListener("click", close);

    // Model item clicks (delegated)
    popupEl.addEventListener("click", function (e) {
      var modelItem = e.target.closest(".model-item");
      if (modelItem) {
        var modelId = modelItem.dataset.modelId;
        var model = allModels.find(function (m) { return m.id === modelId; });
        if (model) { selectModel(model); }
      }
    });

    // Keyboard shortcuts (scoped to popup)
    popupEl.addEventListener("keydown", handleKeyDown);

    // Prevent backdrop clicks from closing when clicking dialog
    var dialog = popupEl.querySelector(".model-picker-dialog");
    dialog?.addEventListener("click", function (e) { e.stopPropagation(); });

    // Initialize keyboard handler
    keyboardHandler = new KeyboardShortcutHandler(popupEl, {
      onClose: close,
      onConnectIntegration: function () {
        if (SS.api && SS.api.connectIntegration) {
          SS.api.connectIntegration();
        }
      },
      onFocusSearch: function () {
        searchInput?.focus();
        searchInput?.select();
      },
    });
  }

  /** Handle keyboard shortcuts within popup context. */
  function handleKeyDown(e) {
    if (!isOpen) { return; }

    var searchInput = popupEl.querySelector("#picker-search");
    var isSearchFocused = document.activeElement === searchInput;

    // Escape - close popup
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    // Ctrl+A - Connect integration (only when NOT in search input)
    if (e.key === "a" && e.ctrlKey && !isSearchFocused) {
      e.preventDefault();
      e.stopPropagation();
      if (SS.api && SS.api.connectIntegration) {
        SS.api.connectIntegration();
      }
      return;
    }

    // Ctrl+F - Focus search field
    if (e.key === "f" && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      searchInput?.focus();
      searchInput?.select();
      return;
    }

    // Arrow navigation in model list
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isSearchFocused) {
      e.preventDefault();
      navigateModels(e.key === "ArrowDown" ? 1 : -1);
    }

    // Enter to select focused model
    if (e.key === "Enter" && !isSearchFocused) {
      e.preventDefault();
      var focusedItem = popupEl.querySelector(".model-item.focused");
      if (focusedItem) {
        var modelId = focusedItem.dataset.modelId;
        var model = allModels.find(function (m) { return m.id === modelId; });
        if (model) { selectModel(model); }
      }
    }
  }

  /** Navigate model list with arrow keys. */
  function navigateModels(direction) {
    var items = popupEl.querySelectorAll(".model-item:not(.hidden)");
    if (items.length === 0) { return; }

    var currentFocused = popupEl.querySelector(".model-item.focused");
    var currentIndex = -1;

    if (currentFocused) {
      currentIndex = Array.from(items).indexOf(currentFocused);
      currentFocused.classList.remove("focused");
    }

    var nextIndex = currentIndex + direction;
    if (nextIndex < 0) { nextIndex = items.length - 1; }
    if (nextIndex >= items.length) { nextIndex = 0; }

    items[nextIndex]?.classList.add("focused");
    items[nextIndex]?.scrollIntoView({ block: "nearest" });
  }

  /** Set the available models and render. */
  function setModels(models) {
    allModels = models || [];
    filterModels();
  }

  /** Filter models based on search query. */
  function filterModels() {
    if (!searchQuery) {
      filteredModels = allModels.slice();
    } else {
      filteredModels = allModels.filter(function (m) {
        return m.name.toLowerCase().includes(searchQuery) ||
               m.id.toLowerCase().includes(searchQuery) ||
               m.provider.toLowerCase().includes(searchQuery);
      });
    }
    renderModelList();
  }

  /** Render the model list and recent section. */
  function renderModelList() {
    if (!popupEl) { return; }

    var modelListEl = popupEl.querySelector("#model-list");
    var recentListEl = popupEl.querySelector("#recent-model-list");
    var recentSection = popupEl.querySelector("#picker-recent");
    var emptyState = popupEl.querySelector("#empty-state");

    // Render recent models
    if (recentModels.length > 0) {
      recentSection.hidden = false;
      recentListEl.innerHTML = recentModels
        .map(function (m) { return renderModelItem(m, true); })
        .join("");
    } else {
      recentSection.hidden = true;
    }

    // Render all models grouped by provider
    if (filteredModels.length > 0) {
      emptyState.hidden = true;
      modelListEl.innerHTML = renderGroupedModels(filteredModels);
    } else {
      emptyState.hidden = false;
      modelListEl.innerHTML = "";
    }
  }

  /** Render models grouped by provider. */
  function renderGroupedModels(models) {
    var groups = new Map();

    for (var i = 0; i < models.length; i++) {
      var model = models[i];
      var providerLabel = PROVIDER_LABELS[model.providerId] || model.provider;
      if (!groups.has(providerLabel)) {
        groups.set(providerLabel, []);
      }
      groups.get(providerLabel).push(model);
    }

    var html = "";
    groups.forEach(function (providerModels, providerLabel) {
      html += "<div class=\"model-group\"><h5>" + escapeHtml(providerLabel) + "</h5><div class=\"model-group-list\">";
      for (var i = 0; i < providerModels.length; i++) {
        html += renderModelItem(providerModels[i], false);
      }
      html += "</div></div>";
    });
    return html;
  }

  /** Render a single model item. */
  function renderModelItem(model, isRecent) {
    var freeBadge = model.isFree
      ? "<span class=\"model-badge free-badge\">Free</span>"
      : (model.rateMultiplier && model.rateMultiplier > 0
        ? "<span class=\"model-badge paid-badge\">" + model.rateMultiplier + "x</span>"
        : "");

    return "\
      <button class=\"model-item" + (isRecent ? " recent" : "") + "\" data-model-id=\"" + model.id + "\" type=\"button\" tabindex=\"0\">\n\
        <span class=\"model-item-name\">" + escapeHtml(model.name) + "</span>\n\
        <span class=\"model-item-provider\">" + escapeHtml(PROVIDER_LABELS[model.providerId] || model.provider) + "</span>\n\
        " + freeBadge + "\n\
      </button>";
  }

  /** Select a model and close popup. */
  function selectModel(model) {
    addToRecent(model);
    if (SS.setModel) {
      SS.setModel(model.id);
    }
    if (SS.vscode) {
      SS.vscode.postMessage({ type: "chat:setModel", model: model.id });
    }
    close();
  }

  /** Add model to recent list and persist. */
  function addToRecent(model) {
    // Remove if already exists
    recentModels = recentModels.filter(function (m) { return m.id !== model.id; });
    // Add to front
    recentModels.unshift(model);
    // Limit size
    if (recentModels.length > MAX_RECENT_MODELS) {
      recentModels = recentModels.slice(0, MAX_RECENT_MODELS);
    }
    saveRecentModels();
  }

  /** Load recent models from localStorage. */
  function loadRecentModels() {
    try {
      var stored = localStorage.getItem(RECENT_STORAGE_KEY);
      if (stored) {
        recentModels = JSON.parse(stored);
      }
    } catch (e) {
      recentModels = [];
    }
  }

  /** Save recent models to localStorage. */
  function saveRecentModels() {
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentModels));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /** Open the popup at the given anchor element position. */
  function open(anchorEl) {
    if (!popupEl || isOpen) { return; }

    loadRecentModels();
    isOpen = true;
    popupEl.classList.remove("hidden");

    // Position near anchor if provided
    if (anchorEl) {
      var rect = anchorEl.getBoundingClientRect();
      var dialog = popupEl.querySelector(".model-picker-dialog");
      dialog.style.top = (rect.bottom + 4) + "px";
      dialog.style.left = rect.left + "px";
    }

    // Focus search input
    setTimeout(function () {
      var searchInput = popupEl.querySelector("#picker-search");
      searchInput?.focus();
    }, 50);

    // Re-render to show recent
    renderModelList();
  }

  /** Close the popup. */
  function close() {
    if (!popupEl || !isOpen) { return; }
    isOpen = false;
    popupEl.classList.add("hidden");
    searchQuery = "";
    var searchInput = popupEl.querySelector("#picker-search");
    if (searchInput) { searchInput.value = ""; }
  }

  /** Check if popup is open. */
  function isVisible() {
    return isOpen;
  }

  /** Destroy the popup and clean up. */
  function destroy() {
    popupEl?.remove();
    popupEl = null;
    if (keyboardHandler) {
      keyboardHandler.detach();
      keyboardHandler = null;
    }
  }

  /** Escape HTML to prevent XSS. */
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"")
      .replace(/'/g, "'");
  }

  /** KeyboardShortcutHandler class for scoped shortcuts. */
  function KeyboardShortcutHandler(popupEl, callbacks) {
    this.popupEl = popupEl;
    this.callbacks = callbacks;
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.attachEvents();
  }

  KeyboardShortcutHandler.prototype.attachEvents = function () {
    if (this.popupEl) {
      this.popupEl.addEventListener("keydown", this.boundHandleKeyDown);
    }
  };

  KeyboardShortcutHandler.prototype.detach = function () {
    if (this.popupEl) {
      this.popupEl.removeEventListener("keydown", this.boundHandleKeyDown);
    }
  };

  KeyboardShortcutHandler.prototype.handleKeyDown = function (e) {
    var activeEl = document.activeElement;
    var isPopupFocused =
      this.popupEl === activeEl ||
      this.popupEl?.contains(activeEl) ||
      (activeEl?.classList?.contains("model-item") && this.popupEl?.contains(activeEl));

    if (!isPopupFocused) { return; }

    var searchInput = this.popupEl?.querySelector("#picker-search");
    var isSearchFocused = activeEl === searchInput;

    // Escape - close popup
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onClose();
      return;
    }

    // Ctrl+A - Connect integration (prevent "Select All" in search)
    if (e.key === "a" && e.ctrlKey && !isSearchFocused) {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onConnectIntegration();
      return;
    }

    // Ctrl+F - Focus search field (prevent browser "Find")
    if (e.key === "f" && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onFocusSearch();
      return;
    }

    // Arrow navigation for model items (when search not focused)
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isSearchFocused) {
      e.preventDefault();
      this.navigateModelItems(e.key === "ArrowDown" ? 1 : -1);
      return;
    }

    // Enter to select focused model item
    if (e.key === "Enter" && !isSearchFocused) {
      var focusedItem = this.popupEl?.querySelector(".model-item.focused");
      if (focusedItem) {
        e.preventDefault();
        focusedItem.click();
      }
    }
  };

  KeyboardShortcutHandler.prototype.navigateModelItems = function (direction) {
    if (!this.popupEl) { return; }

    var items = this.popupEl.querySelectorAll(".model-item:not(.hidden)");
    if (items.length === 0) { return; }

    var currentFocused = this.popupEl.querySelector(".model-item.focused");
    var currentIndex = -1;

    if (currentFocused) {
      currentIndex = Array.from(items).indexOf(currentFocused);
      currentFocused.classList.remove("focused");
    }

    var nextIndex = currentIndex + direction;
    if (nextIndex < 0) { nextIndex = items.length - 1; }
    if (nextIndex >= items.length) { nextIndex = 0; }

    var nextItem = items[nextIndex];
    if (nextItem) {
      nextItem.classList.add("focused");
      nextItem.focus();
      nextItem.scrollIntoView({ block: "nearest" });
    }
  };

  // Expose to ChatState
  SS.modelPicker = {
    createPopup: createPopup,
    setModels: setModels,
    open: open,
    close: close,
    isVisible: isVisible,
    destroy: destroy,
  };

  // Initialize on first use
  // The popup will be created when first opened
})();