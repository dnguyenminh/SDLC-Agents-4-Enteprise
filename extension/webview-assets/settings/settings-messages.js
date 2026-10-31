/**
 * Settings Panel — Extension Message Handler + Init
 * Single window "message" listener dispatching state/models/test results to
 * the settings modules, plus the "ready" handshake (MUST load after all
 * other settings modules).
 * SA4E-390: Added handlers for profile table messages (profiles, profileTested, etc.)
 */
(function () {
  "use strict";
  var SS = window.SettingsShared;

  var vscode = SS.vscode;
  var showStatus = SS.showStatus;
  var backendResult = SS.backendResult;
  var wrapperResult = SS.wrapperResult;
  var savePegaBtn = SS.savePegaBtn;
  var testPegaBtn = SS.testPegaBtn;
  var fetchPegaBtn = SS.fetchPegaBtn;
  var pegaTestResult = SS.pegaTestResult;
  var saveAtlassianBtn = SS.saveAtlassianBtn;
  var testAtlassianBtn = SS.testAtlassianBtn;
  var atlassianTestResult = SS.atlassianTestResult;
  var testOllamaBtn = SS.testOllamaBtn;
  var ollamaStatus = SS.ollamaStatus;
  var testLlmBtn = SS.testLlmBtn;
  var testResult = SS.testResult;

  // ─── Post Message Handler ──────────────────────────────────────────────────────

  window.addEventListener("message", function (event) {
    var msg = event.data;
    switch (msg.type) {
      case "state": SS.handleState(msg); break;
      case "models": SS.handleModels(msg); break;
      case "keySaved": SS.handleKeySaved(msg); break;
      case "keyCleared": SS.handleKeyCleared(msg); break;
      case "ollamaTestResult": handleOllamaTestResult(msg); break;
      case "llmTestResult": handleLlmTestResult(msg); break;
      case "backendTestResult":
        const lat = msg.latencyMs ? " (" + msg.latencyMs + "ms)" : "";
        showStatus(backendResult, (msg.success ? "\u2705 " : "\u274c ") + msg.message + lat, msg.success ? "success" : "error");
        break;
      case "backendUrlSaved":
        // Overrides the optimistic "Saved ✓" when server-side validation rejects the URL
        showStatus(backendResult, msg.success ? "Saved \u2713" : ("\u274C " + (msg.message || "Invalid URL")), msg.success ? "success" : "error");
        break;
      case "mcpServerRestarted":
        showStatus(wrapperResult, (msg.success ? "\u2705 " : "\u274c ") + msg.message, msg.success ? "success" : "error");
        break;
      case "pegaSaved":
        if (savePegaBtn) { savePegaBtn.classList.remove("loading"); savePegaBtn.disabled = false; }
        showStatus(pegaTestResult, msg.success ? "\u2705 Pega config saved" : ("\u274C Save failed: " + (msg.error || "")), msg.success ? "success" : "error");
        break;
      case "pegaTestResult":
        if (testPegaBtn) { testPegaBtn.classList.remove("loading"); testPegaBtn.disabled = false; }
        showStatus(pegaTestResult, (msg.success ? "\u2705 " : "\u274C ") + msg.message, msg.success ? "success" : "error");
        break;
      case "pegaContextFetched":
        if (fetchPegaBtn) { fetchPegaBtn.classList.remove("loading"); fetchPegaBtn.disabled = false; }
        showStatus(pegaTestResult, (msg.success ? "\u2705 " : "\u274C ") + msg.message, msg.success ? "success" : "error");
        break;
      case "atlassianSaved":
        if (saveAtlassianBtn) { saveAtlassianBtn.classList.remove("loading"); saveAtlassianBtn.disabled = false; }
        showStatus(atlassianTestResult, msg.success ? "\u2705 Atlassian config saved" : ("\u274C Save failed: " + (msg.error || "")), msg.success ? "success" : "error");
        break;
      case "atlassianTestResult":
        if (testAtlassianBtn) { testAtlassianBtn.classList.remove("loading"); testAtlassianBtn.disabled = false; }
        showStatus(atlassianTestResult, (msg.success ? "\u2705 " : "\u274C ") + msg.message, msg.success ? "success" : "error");
        break;
      // SA4E-390: Provider table messages
      case "profiles": handleProfiles(msg); break;
      case "profileAdded": handleProfileAdded(msg); break;
      case "profileEdited": handleProfileEdited(msg); break;
      case "profileDeleted": handleProfileDeleted(msg); break;
      case "activeProfileSet": handleActiveProfileSet(msg); break;
      case "profileTestStarted": handleProfileTestStarted(msg); break;
      case "profileTested": handleProfileTested(msg); break;
      case "saveAllResult": handleSaveAllResult(msg); break;
    }
  });

  function handleOllamaTestResult(msg) {
    testOllamaBtn.classList.remove("loading");
    testOllamaBtn.disabled = false;
    if (msg.success) {
      ollamaStatus.textContent = "\u2705 " + msg.message;
      ollamaStatus.className = "status-indicator success";
    } else {
      ollamaStatus.textContent = "\u274C " + msg.message;
      ollamaStatus.className = "status-indicator error";
    }
  }

  function handleLlmTestResult(msg) {
    testLlmBtn.classList.remove("loading");
    testLlmBtn.disabled = false;
    testResult.style.display = "block";
    var html;
    if (msg.success) {
      testResult.className = "test-result success";
      html =
        '<div class="result-label">\u2705 Success</div>' +
        '<div class="result-body">' + SS.escapeHtml(msg.message) + "</div>" +
        '<div class="result-meta">' +
        (msg.model ? "Model: " + SS.escapeHtml(msg.model) : "") +
        (msg.latencyMs ? " \u2022 Latency: " + msg.latencyMs + "ms" : "") +
        "</div>";
    } else {
      testResult.className = "test-result error";
      html =
        '<div class="result-label">\u274C Failed</div>' +
        '<div class="result-body">' + SS.escapeHtml(msg.error || msg.message) + "</div>" +
        (msg.latencyMs ? '<div class="result-meta">Latency: ' + msg.latencyMs + "ms</div>" : "");
    }
    testResult.innerHTML = html;
    // Save per-provider
    var s = SS.getProviderState(SS.currentProvider);
    s.testResult = { success: msg.success, html: html };
  }

  // ─── SA4E-390: Provider Table Handlers ───────────────────────────────────────

  function handleProfiles(msg) {
    if (SS.providerTable) {
      SS.providerTable.handleProfiles(msg);
    }
  }

  function handleProfileAdded(msg) {
    if (msg.success && SS.providerTable) {
      vscode.postMessage({ type: "getProfiles" });
    } else if (!msg.success) {
      showStatus(testResult, "\u274C " + (msg.error || "Failed to add profile"), "error");
    }
  }

  function handleProfileEdited(msg) {
    if (msg.success && SS.providerTable) {
      vscode.postMessage({ type: "getProfiles" });
    } else if (!msg.success) {
      showStatus(testResult, "\u274C " + (msg.error || "Failed to edit profile"), "error");
    }
  }

  function handleProfileDeleted(msg) {
    if (msg.success && SS.providerTable) {
      vscode.postMessage({ type: "getProfiles" });
    } else if (!msg.success) {
      showStatus(testResult, "\u274C " + (msg.error || "Failed to delete profile"), "error");
    }
  }

  function handleActiveProfileSet(msg) {
    if (msg.success && SS.providerTable) {
      vscode.postMessage({ type: "getProfiles" });
    }
  }

  function handleProfileTestStarted(msg) {
    // Update table row to show "Testing..." state
    if (SS.providerTable && msg.profileId) {
      SS.providerTable.updateProfileStatus(msg.profileId, "testing");
    }
  }

  function handleProfileTested(msg) {
    if (SS.providerTable && msg.profileId) {
      var status = msg.success ? "connected" : "failed";
      SS.providerTable.updateProfileStatus(msg.profileId, status);
    }
    // Also show in test result area
    testLlmBtn.classList.remove("loading");
    testLlmBtn.disabled = false;
    testResult.style.display = "block";
    var html;
    if (msg.success) {
      testResult.className = "test-result success";
      html =
        '<div class="result-label">\u2705 Success</div>' +
        '<div class="result-body">' + SS.escapeHtml(msg.message) + "</div>" +
        '<div class="result-meta">' +
        (msg.model ? "Model: " + SS.escapeHtml(msg.model) : "") +
        (msg.latencyMs ? " \u2022 Latency: " + msg.latencyMs + "ms" : "") +
        "</div>";
    } else {
      testResult.className = "test-result error";
      html =
        '<div class="result-label">\u274C Failed</div>' +
        '<div class="result-body">' + SS.escapeHtml(msg.error || msg.message) + "</div>" +
        (msg.latencyMs ? '<div class="result-meta">Latency: ' + msg.latencyMs + "ms</div>" : "");
    }
    testResult.innerHTML = html;
  }

  function handleSaveAllResult(msg) {
    var saveAllBtn = document.getElementById("save-all-btn");
    if (saveAllBtn) {
      saveAllBtn.classList.remove("loading");
      saveAllBtn.disabled = false;
    }
    if (msg.success) {
      showStatus(testResult, "\u2705 " + msg.message, "success");
    } else {
      showStatus(testResult, "\u274C " + (msg.error || msg.message), "error");
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  vscode.postMessage({ type: "ready" });
})();
