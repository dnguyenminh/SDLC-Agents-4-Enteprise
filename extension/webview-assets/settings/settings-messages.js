/**
 * Settings Panel — Extension Message Handler + Init
 * Single window "message" listener dispatching state/models/test results to
 * the settings modules, plus the "ready" handshake (MUST load after all
 * other settings modules).
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
      case "state": if (SS.handleState) { SS.handleState(msg); } break;
      case "models": if (SS.handleModels) { SS.handleModels(msg); } break;
      // SA4E-390: key/ollama handlers lived in the removed single-provider
      // modules — guard so legacy messages are harmless no-ops.
      case "keySaved": if (SS.handleKeySaved) { SS.handleKeySaved(msg); } break;
      case "keyCleared": if (SS.handleKeyCleared) { SS.handleKeyCleared(msg); } break;
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
    }
  });

  function handleOllamaTestResult(msg) {
    // SA4E-390: Ollama section was removed from the LLM tab — guard the DOM.
    if (!testOllamaBtn) { return; }
    testOllamaBtn.classList.remove("loading");
    testOllamaBtn.disabled = false;
    if (ollamaStatus) {
      ollamaStatus.textContent = (msg.success ? "\u2705 " : "\u274C ") + msg.message;
      ollamaStatus.className = "status-indicator " + (msg.success ? "success" : "error");
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

  // ─── Test LLM binding (SA4E-390) ────────────────────────────────────────────
  // The single-provider inputs module was removed, so bind the standalone
  // "Test LLM" button here. With no provider/model/baseUrl override, the host
  // tests the ACTIVE profile (or the flat llm.* config fallback) end-to-end.
  if (testLlmBtn) {
    testLlmBtn.addEventListener("click", function () {
      testLlmBtn.classList.add("loading");
      testLlmBtn.disabled = true;
      if (testResult) { testResult.style.display = "none"; }
      vscode.postMessage({ type: "testLlmConnection" });
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  vscode.postMessage({ type: "ready" });
})();
