/**
 * Settings Panel — Server / Pega / Atlassian Connection Bindings
 * Backend URL + MCP wrapper events (SA4E-320 insecure bypass), Pega
 * platform connection, Atlassian connection.
 */
(function () {
  "use strict";
  var SS = window.SettingsShared;

  var vscode = SS.vscode;
  var showStatus = SS.showStatus;
  var backendUrlInput = SS.backendUrlInput;
  var saveBackendBtn = SS.saveBackendBtn;
  var testBackendBtn = SS.testBackendBtn;
  var backendResult = SS.backendResult;
  var allowInsecureChk = SS.allowInsecureChk;
  var allowInsecureWarning = SS.allowInsecureWarning;
  var mcpPortInput = SS.mcpPortInput;
  var enableMcpChk = SS.enableMcpChk;
  var saveWrapperBtn = SS.saveWrapperBtn;
  var restartMcpBtn = SS.restartMcpBtn;
  var wrapperResult = SS.wrapperResult;
  var togglePegaPasswordBtn = SS.togglePegaPasswordBtn;
  var pegaEndpointInput = SS.pegaEndpointInput;
  var pegaUsernameInput = SS.pegaUsernameInput;
  var pegaPasswordInput = SS.pegaPasswordInput;
  var savePegaBtn = SS.savePegaBtn;
  var testPegaBtn = SS.testPegaBtn;
  var fetchPegaBtn = SS.fetchPegaBtn;
  var pegaTestResult = SS.pegaTestResult;
  var atlassianUrlInput = SS.atlassianUrlInput;
  var atlassianEmailInput = SS.atlassianEmailInput;
  var atlassianTokenInput = SS.atlassianTokenInput;
  var toggleAtlassianTokenBtn = SS.toggleAtlassianTokenBtn;
  var saveAtlassianBtn = SS.saveAtlassianBtn;
  var testAtlassianBtn = SS.testAtlassianBtn;
  var atlassianTestResult = SS.atlassianTestResult;

  // ─── Server Settings Events ───────────────────────────────────────────────

  saveBackendBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "setBackendUrl", url: backendUrlInput.value.trim() });
    showStatus(backendResult, "Saved \u2713", "success");
  });

  // SA4E-320 — persist bypass flag immediately on change + toggle warning
  allowInsecureChk.addEventListener("change", function () {
    allowInsecureWarning.hidden = !allowInsecureChk.checked;
    vscode.postMessage({ type: "setAllowInsecureRemote", enabled: allowInsecureChk.checked });
  });

  testBackendBtn.addEventListener("click", () => {
    backendResult.textContent = "Testing...";
    backendResult.className = "status-indicator";
    vscode.postMessage({ type: "testBackendConnection", url: backendUrlInput.value.trim() });
  });

  saveWrapperBtn.addEventListener("click", () => {
    const port = parseInt(mcpPortInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      showStatus(wrapperResult, "Invalid port (1\u201365535)", "error");
      return;
    }
    vscode.postMessage({ type: "setMcpServerPort", port: port });
    vscode.postMessage({ type: "setEnableMcpServer", enabled: enableMcpChk.checked });
    showStatus(wrapperResult, "Saved \u2713", "success");
  });

  restartMcpBtn.addEventListener("click", () => {
    wrapperResult.textContent = "Restarting...";
    wrapperResult.className = "status-indicator";
    vscode.postMessage({ type: "restartMcpServer" });
  });

  // ─── Pega Platform Connection Events ─────────────────────────────────────

  if (togglePegaPasswordBtn && pegaPasswordInput) {
    togglePegaPasswordBtn.addEventListener("click", () => {
      const isHidden = pegaPasswordInput.type === "password";
      pegaPasswordInput.type = isHidden ? "text" : "password";
      togglePegaPasswordBtn.textContent = isHidden ? "\uD83D\uDE48" : "\uD83D\uDC41";
    });
  }

  if (savePegaBtn) {
    savePegaBtn.addEventListener("click", () => {
      const endpoint = pegaEndpointInput ? pegaEndpointInput.value.trim() : "";
      const username = pegaUsernameInput ? pegaUsernameInput.value.trim() : "";
      const password = pegaPasswordInput ? pegaPasswordInput.value : "";
      if (!endpoint) {
        showStatus(pegaTestResult, "\u274C Pega Endpoint URL is required", "error");
        return;
      }
      savePegaBtn.classList.add("loading");
      savePegaBtn.disabled = true;
      vscode.postMessage({ type: "savePegaConfig", endpoint, username, password });
    });
  }

  if (testPegaBtn) {
    testPegaBtn.addEventListener("click", () => {
      pegaTestResult.textContent = "Testing connection...";
      pegaTestResult.className = "status-indicator";
      testPegaBtn.classList.add("loading");
      testPegaBtn.disabled = true;
      vscode.postMessage({ type: "testPegaConnection" });
    });
  }

  if (fetchPegaBtn) {
    fetchPegaBtn.addEventListener("click", () => {
      pegaTestResult.textContent = "Fetching Pega App Context...";
      pegaTestResult.className = "status-indicator";
      fetchPegaBtn.classList.add("loading");
      fetchPegaBtn.disabled = true;
      vscode.postMessage({ type: "fetchPegaContext" });
    });
  }

  // ─── Atlassian Connection Events ───────────────────────────────────────

  if (toggleAtlassianTokenBtn && atlassianTokenInput) {
    toggleAtlassianTokenBtn.addEventListener("click", () => {
      const isHidden = atlassianTokenInput.type === "password";
      atlassianTokenInput.type = isHidden ? "text" : "password";
      toggleAtlassianTokenBtn.textContent = isHidden ? "\uD83D\uDE48" : "\uD83D\uDC41";
    });
  }

  if (saveAtlassianBtn) {
    saveAtlassianBtn.addEventListener("click", () => {
      const baseUrl = atlassianUrlInput ? atlassianUrlInput.value.trim() : "";
      const email = atlassianEmailInput ? atlassianEmailInput.value.trim() : "";
      const apiToken = atlassianTokenInput ? atlassianTokenInput.value : "";
      const typeEl = document.querySelector('input[name="atlassian-type"]:checked');
      const connectionType = typeEl ? typeEl.value : "cloud";
      if (!baseUrl) {
        showStatus(atlassianTestResult, "\u274C Jira Base URL is required", "error");
        return;
      }
      saveAtlassianBtn.classList.add("loading");
      saveAtlassianBtn.disabled = true;
      vscode.postMessage({ type: "saveAtlassianConfig", baseUrl, email, apiToken, connectionType });
    });
  }

  if (testAtlassianBtn) {
    testAtlassianBtn.addEventListener("click", () => {
      atlassianTestResult.textContent = "Testing connection...";
      atlassianTestResult.className = "status-indicator";
      testAtlassianBtn.classList.add("loading");
      testAtlassianBtn.disabled = true;
      vscode.postMessage({ type: "testAtlassianConnection" });
    });
  }
})();
