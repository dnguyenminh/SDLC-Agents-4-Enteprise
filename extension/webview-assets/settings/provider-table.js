/**
 * Provider Table Webview Module — Initializes and manages the ProviderTable component.
 * Communicates with extension host via vscode.postMessage.
 * SA4E-390: 6-column table with Name, Status, API Key (masked), Base URL, Model, Actions.
 */
(function () {
  "use strict";

  var vscode = acquireVsCodeApi();
  var SS = window.SettingsShared = window.SettingsShared || {};

  // DOM elements
  var providerTableRoot = document.getElementById("provider-table-root");
  var addProfileBtn = document.getElementById("add-profile-btn");
  var saveAllBtn = document.getElementById("save-all-btn");

  // State
  var profiles = [];
  var activeProfileId = undefined;

  // Constants
  var PROVIDER_LABELS = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    lmstudio: "LM Studio",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    onnx: "ONNX",
  };

  var STATUS_LABELS = {
    connected: "Connected",
    disconnected: "Failed",
    unknown: "Untested",
    testing: "Testing...",
  };

  var STATUS_CLASSES = {
    connected: "status-badge connected",
    disconnected: "status-badge disconnected",
    unknown: "status-badge unknown",
    testing: "status-badge testing",
  };

  var MASKED_API_KEY = "●●●●●●●●●●●●●●●●●●●●";

  /** ProviderTable class - renders and manages the provider table. */
  function ProviderTable(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.profiles = [];
    this.render();
  }

  ProviderTable.prototype.setProfiles = function (profiles) {
    this.profiles = profiles;
    this.render();
  };

  ProviderTable.prototype.updateProfileStatus = function (profileId, status) {
    var profile = this.profiles.find(function (p) { return p.id === profileId; });
    if (profile) {
      profile.status = status;
      profile.lastTestStatus = status;
      this.render();
    }
  };

  ProviderTable.prototype.render = function () {
    var rowsHtml = this.profiles
      .map(this.renderRow.bind(this))
      .join("");

    this.container.innerHTML = "\
      <div class=\"provider-table-wrapper\">\n\
        <div class=\"table-toolbar\">\n\
          <h3>LLM Providers</h3>\n\
        </div>\n\
        <div class=\"table-container\">\n\
          <table class=\"provider-table\" role=\"grid\">\n\
            <thead>\n\
              <tr>\n\
                <th scope=\"col\">Name</th>\n\
                <th scope=\"col\">Status</th>\n\
                <th scope=\"col\">API Key</th>\n\
                <th scope=\"col\">Base URL</th>\n\
                <th scope=\"col\">Model</th>\n\
                <th scope=\"col\">Actions</th>\n\
              </tr>\n\
            </thead>\n\
            <tbody>\n\
              " + (rowsHtml || this.renderEmptyRow()) + "\n\
            </tbody>\n\
          </table>\n\
        </div>\n\
      </div>";

    this.bindEvents();
  };

  ProviderTable.prototype.renderRow = function (profile) {
    var providerLabel = PROVIDER_LABELS[profile.provider] || profile.provider;
    var status = profile.status;
    var statusLabel = STATUS_LABELS[status] || status;
    var statusClass = STATUS_CLASSES[status] || STATUS_CLASSES.unknown;
    var baseUrl = profile.baseUrl || (profile.provider === "ollama" ? "http://localhost:11434" : "Use default");
    var apiKeyDisplay = profile.apiKeyMasked || "—";

    return "\
      <tr data-provider-id=\"" + profile.provider + "\" data-profile-id=\"" + (profile.id || profile.profileId) + "\">\n\
        <td class=\"provider-name\">\n\
          <span class=\"provider-icon\">" + this.getProviderIcon(profile.provider) + "</span>\n\
          <span class=\"provider-label\">" + this.escapeHtml(providerLabel) + "</span>\n\
          <span class=\"provider-id\">(" + profile.provider + ")</span>\n\
        </td>\n\
        <td class=\"provider-status\">\n\
          <span class=\"" + statusClass + "\">" + statusLabel + "</span>\n\
        </td>\n\
        <td class=\"provider-api-key\" title=\"Click Edit to change\">" + apiKeyDisplay + "</td>\n\
        <td class=\"provider-base-url\" title=\"" + this.escapeHtml(baseUrl) + "\">" + this.escapeHtml(baseUrl) + "</td>\n\
        <td class=\"provider-model\">" + this.escapeHtml(profile.model || "—") + "</td>\n\
        <td class=\"provider-actions\">\n\
          <button class=\"icon-btn edit-btn\" data-action=\"edit\" title=\"Edit provider\" aria-label=\"Edit " + providerLabel + "\">\u270F\uFE0F</button>\n\
          <button class=\"icon-btn test-btn\" data-action=\"test\" title=\"Test connection\" aria-label=\"Test " + providerLabel + " connection\">\uD83D\uDD04</button>\n\
          <button class=\"icon-btn delete-btn\" data-action=\"delete\" title=\"Delete provider\" aria-label=\"Delete " + providerLabel + "\">\uD83D\uDDD1\uFE0F</button>\n\
        </td>\n\
      </tr>";
  };

  ProviderTable.prototype.renderEmptyRow = function () {
    return "\
      <tr class=\"empty-row\">\n\
        <td colspan=\"6\" class=\"empty-state\">\n\
          <p>No providers configured</p>\n\
          <p class=\"hint\">Click \"Add Provider\" to configure your first LLM provider</p>\n\
        </td>\n\
      </tr>";
  };

  ProviderTable.prototype.bindEvents = function () {
    var self = this;
    this.container.querySelectorAll(".provider-actions .icon-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var target = e.currentTarget;
        var action = target.dataset.action;
        var row = target.closest("tr");
        var profileId = row.dataset.profileId || row.dataset.providerId;

        if (!profileId) { return; }

        switch (action) {
          case "edit":
            self.callbacks.onEdit(profileId);
            break;
          case "test":
            self.callbacks.onTest(profileId);
            break;
          case "delete":
            self.callbacks.onDelete(profileId);
            break;
        }
      });
    });
  };

  ProviderTable.prototype.getProviderIcon = function (provider) {
    var icons = {
      anthropic: "\uD83E\uDD16",
      openai: "\uD83E\uDDE0",
      lmstudio: "\uD83D\uDCBB",
      openrouter: "\uD83D\uDD00",
      ollama: "\uD83E\uDD99",
      onnx: "\u2699\uFE0F",
    };
    return icons[provider] || "\uD83D\uDCE6";
  };

  ProviderTable.prototype.escapeHtml = function (str) {
    return str
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"")
      .replace(/'/g, "'");
  };

  // Expose to SettingsShared
  SS.ProviderTable = ProviderTable;

  // Initialize when DOM is ready
  function init() {
    if (!providerTableRoot) {
      console.warn("[provider-table] provider-table-root not found");
      return;
    }

    // Initialize ProviderTable
    SS.providerTable = new ProviderTable(providerTableRoot, {
      onEdit: handleEditProfile,
      onTest: handleTestProfile,
      onDelete: handleDeleteProfile,
      onAdd: openEditModalForAdd,
    });

    // Bind add profile button
    if (addProfileBtn) {
      addProfileBtn.addEventListener("click", openEditModalForAdd);
    }

    // Bind save all button
    if (saveAllBtn) {
      saveAllBtn.addEventListener("click", handleSaveAll);
    }

    // Request initial profiles
    vscode.postMessage({ type: "getProfiles" });
  }

  /** Handle profile list from extension host. */
  function handleProfiles(msg) {
    profiles = msg.profiles || [];
    activeProfileId = msg.activeProfileId;
    if (SS.providerTable) {
      var tableProfiles = profiles.map(function (p) {
        return {
          id: p.profileId,
          name: p.label,
          provider: p.provider,
          model: p.model,
          baseUrl: p.baseUrl || "",
          apiKeyMasked: p.hasApiKey ? MASKED_API_KEY : "",
          status: p.lastTestStatus || "unknown",
          lastTestStatus: p.lastTestStatus,
          lastTestAt: p.lastTestedAt,
        };
      });
      SS.providerTable.setProfiles(tableProfiles);
    }
    updateSaveAllButton();
  }

  /** Update save all button state. */
  function updateSaveAllButton() {
    if (saveAllBtn) {
      saveAllBtn.disabled = profiles.length === 0;
    }
  }

  /** Open modal for adding new profile. */
  function openEditModalForAdd() {
    if (SS.editProviderModal) {
      SS.editProviderModal.showForAdd();
    }
  }

  /** Handle edit profile. */
  function handleEditProfile(profileId) {
    var profile = profiles.find(function (p) { return p.profileId === profileId; });
    if (profile && SS.editProviderModal) {
      SS.editProviderModal.showForEdit(profileId, {
        providerId: profile.provider,
        apiKey: profile.hasApiKey ? MASKED_API_KEY : "",
        baseUrl: profile.baseUrl || "",
        model: profile.model,
      });
    }
  }

  /** Handle test profile connection. */
  function handleTestProfile(profileId) {
    vscode.postMessage({ type: "testProfile", profileId: profileId });
  }

  /** Handle delete profile. */
  function handleDeleteProfile(profileId) {
    if (confirm("Delete this provider configuration?")) {
      vscode.postMessage({ type: "deleteProfile", profileId: profileId });
    }
  }

  /** Handle Save All button click. */
  async function handleSaveAll() {
    if (profiles.length === 0) { return; }

    saveAllBtn.disabled = true;
    saveAllBtn.classList.add("loading");

    try {
      var providerConfigs = profiles.map(function (p) {
        return {
          profileId: p.profileId,
          label: p.label,
          provider: p.provider,
          model: p.model,
          baseUrl: p.baseUrl,
          // API key will be read from SecretStorage by extension host
        };
      });

      vscode.postMessage({
        type: "saveAllProfiles",
        profiles: providerConfigs,
      });
    } catch (err) {
      SS.showStatus(document.getElementById("test-result"), "Save failed: " + err.message, "error");
      saveAllBtn.disabled = false;
      saveAllBtn.classList.remove("loading");
    }
  }

  // Message handler for extension -> webview
  window.addEventListener("message", function (event) {
    var msg = event.data;
    switch (msg.type) {
      case "profiles":
        handleProfiles(msg);
        break;
      case "profileAdded":
      case "profileEdited":
      case "profileDeleted":
      case "activeProfileSet":
        // Refresh profiles
        vscode.postMessage({ type: "getProfiles" });
        break;
      case "profileTested":
        // Update status badge in table
        if (SS.providerTable && msg.profileId) {
          var status = msg.success ? "connected" : "disconnected";
          SS.providerTable.updateProfileStatus(msg.profileId, status);
        }
        break;
      case "saveAllResult":
        if (saveAllBtn) {
          saveAllBtn.disabled = false;
          saveAllBtn.classList.remove("loading");
        }
        var statusEl = document.getElementById("test-result");
        if (statusEl) {
          SS.showStatus(statusEl, msg.success ? ("\u2705 " + msg.message) : ("\u274C " + (msg.error || msg.message)), msg.success ? "success" : "error");
        }
        break;
    }
  });

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();