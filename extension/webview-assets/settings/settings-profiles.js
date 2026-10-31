/**
 * settings-profiles.js — Profile table CRUD + test connection UI logic.
 * SA4E-389: Multi-profile LLM configuration management.
 * Loads after settings-messages.js, depends on window.SettingsShared.vscode.
 */

(function () {
  "use strict";

  var S = window.SettingsShared;
  var vscode = S.vscode;

  // DOM refs
  var tableBody = document.getElementById("profiles-tbody");
  var noProfilesMsg = document.getElementById("no-profiles-msg");
  var addProfileBtn = document.getElementById("add-profile-btn");
  var modal = document.getElementById("profile-modal");
  var modalTitle = document.getElementById("profile-modal-title");
  var modalForm = document.getElementById("profile-form");
  var modalCloseBtn = modal.querySelector(".modal-close");
  var modalCancelBtn = document.getElementById("profile-cancel-btn");
  var profileIdInput = document.getElementById("profile-form-id-input");
  var useDefaultUrlChk = document.getElementById("profile-form-use-default-url");
  var baseUrlInput = document.getElementById("profile-form-base-url");
  var baseUrlHint = document.getElementById("profile-form-base-url-hint");
  var toggleKeyBtn = document.getElementById("profile-toggle-key-visibility");
  var apiKeyInput = document.getElementById("profile-form-api-key");

  var editingProfileId = null;

  // Status badge rendering
  function renderStatusBadge(status) {
    var text, cls;
    switch (status) {
      case "connected": text = "&#9989; Connected"; cls = "status-connected"; break;
      case "failed": text = "&#10060; Failed"; cls = "status-failed"; break;
      case "untested":
      default: text = "&#9898; Untested"; cls = "status-untested"; break;
    }
    return '<span class="status-badge ' + cls + '">' + text + '</span>';
  }

  // Format timestamp
  function formatTimestamp(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.toLocaleString();
  }

  // Render a profile row
  function renderRow(profile, isActive) {
    var tr = document.createElement("tr");
    tr.dataset.profileId = profile.profileId;
    if (isActive) { tr.classList.add("active"); }

    var testedAt = profile.lastTestedAt ? " (tested " + formatTimestamp(profile.lastTestedAt) + ")" : "";

    tr.innerHTML =
      '<td class="col-label"><strong>' + escapeHtml(profile.label) + '</strong></td>' +
      '<td class="col-provider">' + escapeHtml(profile.provider) + '</td>' +
      '<td class="col-model">' + escapeHtml(profile.model) + '</td>' +
      '<td class="col-status">' + renderStatusBadge(profile.lastTestStatus) + testedAt + '</td>' +
      '<td class="col-actions">' +
        '<button class="icon-btn btn-edit" data-action="edit" title="Edit" aria-label="Edit profile">&#9998;</button>' +
        '<button class="icon-btn btn-test" data-action="test" title="Test Connection" aria-label="Test connection">&#128295;</button>' +
        '<button class="icon-btn btn-delete" data-action="delete" title="Delete" aria-label="Delete profile">&#128465;</button>' +
        '<button class="icon-btn btn-set-active" data-action="set-active" title="Set Active" aria-label="Set as active profile">&#10004;</button>' +
      '</td>';

    return tr;
  }

  // Escape HTML
  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Populate table
  function populateTable(profiles, activeProfileId) {
    tableBody.innerHTML = "";
    if (profiles.length === 0) {
      noProfilesMsg.style.display = "block";
      return;
    }
    noProfilesMsg.style.display = "none";
    for (var i = 0; i < profiles.length; i++) {
      var isActive = profiles[i].profileId === activeProfileId;
      tableBody.appendChild(renderRow(profiles[i], isActive));
    }
  }

  // Open modal for add
  function openAddModal() {
    editingProfileId = null;
    modalTitle.textContent = "Add Profile";
    modalForm.reset();
    profileIdInput.disabled = false;
    profileIdInput.value = "";
    document.getElementById("profile-form-label").value = "";
    document.getElementById("profile-form-provider").value = "lmstudio";
    document.getElementById("profile-form-model").value = "";
    useDefaultUrlChk.checked = true;
    baseUrlInput.disabled = true;
    baseUrlInput.value = "";
    baseUrlHint.textContent = "";
    apiKeyInput.value = "";
    apiKeyInput.type = "password";
    toggleKeyBtn.textContent = "&#128065;";
    modal.classList.remove("hidden");
    // Focus first input
    setTimeout(function () { document.getElementById("profile-form-label").focus(); }, 50);
  }

  // Open modal for edit
  function openEditModal(profile) {
    editingProfileId = profile.profileId;
    modalTitle.textContent = "Edit Profile";
    modalForm.reset();
    profileIdInput.disabled = true; // ID cannot be changed
    profileIdInput.value = profile.profileId;
    document.getElementById("profile-form-label").value = profile.label;
    document.getElementById("profile-form-provider").value = profile.provider;
    document.getElementById("profile-form-model").value = profile.model;
    useDefaultUrlChk.checked = profile.useDefaultUrl;
    baseUrlInput.disabled = profile.useDefaultUrl;
    baseUrlInput.value = profile.baseUrl || "";
    updateBaseUrlHint(profile.provider, profile.useDefaultUrl);
    // API key field shows masked placeholder
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "Leave empty to keep current key";
    apiKeyInput.type = "password";
    toggleKeyBtn.textContent = "&#128065;";
    modal.classList.remove("hidden");
    setTimeout(function () { document.getElementById("profile-form-label").focus(); }, 50);
  }

  function closeModal() {
    modal.classList.add("hidden");
    editingProfileId = null;
  }

  // Update base URL hint based on provider
  function updateBaseUrlHint(provider, useDefault) {
    var defaults = {
      anthropic: "https://api.anthropic.com",
      openai: "https://api.openai.com/v1",
      lmstudio: "http://localhost:1234/v1",
      openrouter: "https://openrouter.ai/api/v1",
      ollama: "http://localhost:11434",
      onnx: "(local)"
    };
    if (useDefault) {
      baseUrlHint.textContent = "Using default: " + (defaults[provider] || "N/A");
      baseUrlHint.style.color = "var(--vscode-descriptionForeground)";
    } else {
      baseUrlHint.textContent = "Custom URL will be used";
      baseUrlHint.style.color = "var(--vscode-input-foreground)";
    }
  }

  // Toggle API key visibility
  function toggleKeyVisibility() {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleKeyBtn.textContent = "&#128064;";
    } else {
      apiKeyInput.type = "password";
      toggleKeyBtn.textContent = "&#128065;";
    }
  }

  // Handle useDefaultUrl checkbox
  function onUseDefaultUrlChange() {
    var provider = document.getElementById("profile-form-provider").value;
    baseUrlInput.disabled = useDefaultUrlChk.checked;
    updateBaseUrlHint(provider, useDefaultUrlChk.checked);
  }

  // Provider change updates hint
  function onProviderChange() {
    var provider = document.getElementById("profile-form-provider").value;
    updateBaseUrlHint(provider, useDefaultUrlChk.checked);
  }

  // Submit form
  function onFormSubmit(e) {
    e.preventDefault();
    var formData = new FormData(modalForm);
    var payload = {
      id: formData.get("profileId") || profileIdInput.value,
      label: formData.get("label"),
      provider: formData.get("provider"),
      model: formData.get("model"),
      useDefaultUrl: useDefaultUrlChk.checked,
      baseUrl: useDefaultUrlChk.checked ? "" : (formData.get("baseUrl") || ""),
      apiKey: formData.get("apiKey") || undefined,
    };

    if (editingProfileId) {
      // Edit - don't send ID, send profileId in URL
      vscode.postMessage({ type: "editProfile", profileId: editingProfileId, payload: payload });
    } else {
      vscode.postMessage({ type: "addProfile", payload: payload });
    }
    closeModal();
  }

  // Table action buttons
  function onTableClick(e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var tr = btn.closest("tr");
    if (!tr) return;
    var profileId = tr.dataset.profileId;
    var action = btn.dataset.action;

    switch (action) {
      case "edit":
        var profiles = S.state?.profiles || [];
        var profile = profiles.find(function(p) { return p.profileId === profileId; });
        if (profile) openEditModal(profile);
        break;
      case "delete":
        if (confirm("Are you sure you want to delete profile '" + profileId + "'?")) {
          vscode.postMessage({ type: "deleteProfile", profileId: profileId });
        }
        break;
      case "set-active":
        vscode.postMessage({ type: "setActiveProfile", profileId: profileId });
        break;
      case "test":
        vscode.postMessage({ type: "testProfile", profileId: profileId });
        break;
    }
  }

  // Event listeners
  addProfileBtn.addEventListener("click", openAddModal);
  modalCloseBtn.addEventListener("click", closeModal);
  modalCancelBtn.addEventListener("click", closeModal);
  modal.querySelector(".modal-backdrop").addEventListener("click", closeModal);
  modalForm.addEventListener("submit", onFormSubmit);
  tableBody.addEventListener("click", onTableClick);
  useDefaultUrlChk.addEventListener("change", onUseDefaultUrlChange);
  document.getElementById("profile-form-provider").addEventListener("change", onProviderChange);
  toggleKeyBtn.addEventListener("click", toggleKeyVisibility);

  // Handle "profiles" message from extension
  S.onMessage = S.onMessage || function () {};
  var originalOnMessage = S.onMessage;
  S.onMessage = function (msg) {
    if (msg.type === "profiles") {
      populateTable(msg.profiles, msg.activeProfileId);
    } else if (msg.type === "profileAdded" || msg.type === "profileEdited" || msg.type === "profileDeleted" || msg.type === "activeProfileSet") {
      if (msg.success) {
        // Table will be refreshed via subsequent "profiles" message
      } else {
        alert("Operation failed: " + (msg.error || "Unknown error"));
      }
    } else if (msg.type === "profileTestStarted") {
      // Show testing state
      var row = tableBody.querySelector('tr[data-profile-id="' + msg.profileId + '"]');
      if (row) {
        var statusCell = row.querySelector(".col-status");
        if (statusCell) { statusCell.innerHTML = '<span class="status-badge status-testing">&#128295; Testing...</span>'; }
      }
    } else if (msg.type === "profileTested") {
      var row = tableBody.querySelector('tr[data-profile-id="' + msg.profileId + '"]');
      if (row) {
        var statusCell = row.querySelector(".col-status");
        var badge = renderStatusBadge(msg.status);
        var testedAt = msg.testedAt ? " (tested " + formatTimestamp(msg.testedAt) + ")" : "";
        if (statusCell) { statusCell.innerHTML = badge + testedAt; }
        // Update active class
        if (msg.success) { row.classList.add("active"); } // Not exactly, but visual feedback
      }
      if (!msg.success) {
        alert("Connection test failed: " + (msg.error || "Unknown error"));
      }
    }
    originalOnMessage(msg);
  };

  // Initial load
  vscode.postMessage({ type: "getProfiles" });

})();