/**
 * Proxy Tab — Message handlers + init (part 2).
 * Receives proxyState/mode/result messages and applies them to the form.
 * Shared state lives in window.ProxyTab (see proxy-tab.js).
 */
(function () {
  "use strict";

  var PT = window.ProxyTab;
  var vscode = PT.vscode;

  // ── Message Handler ──────────────────────────────────────────────

  window.addEventListener("message", function (event) {
    var msg = event.data;
    switch (msg.type) {
      case "proxyState": handleProxyState(msg); break;
      case "proxyModeChanged": handleModeChanged(msg); break;
      case "proxySaved": handleProxySaved(msg); break;
      case "proxyCredentialsSaved": handleCredsSaved(msg); break;
      case "proxyCredentialsCleared": handleCredsCleared(msg); break;
      case "proxyTestResult": handleTestResult(msg); break;
      case "systemProxyDetected": handleDetected(msg); break;
    }
  });

  function handleProxyState(msg) {
    PT.currentMode = msg.mode || "system";
    PT.setModeRadio(PT.currentMode);
    PT.hostInput.value = msg.host || "";
    PT.portInput.value = String(msg.port || 8080);
    PT.bypassInput.value = msg.bypass || "";
    PT.usernameInput.value = msg.username || "";
    if (msg.hasCredentials) {
      PT.passwordInput.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (Saved)";
    }
    if (msg.detectedProxyUrl) {
      PT.detectedInfo.style.display = "block";
      PT.detectedInfo.textContent = "\u2139\uFE0F Detected: " + msg.detectedProxyUrl;
      PT.detectedInfo.className = "status-indicator success";
    } else if (PT.currentMode === "system") {
      PT.detectedInfo.style.display = "block";
      PT.detectedInfo.textContent = "\u26A0\uFE0F No system proxy detected";
      PT.detectedInfo.className = "status-indicator warning";
    } else {
      PT.detectedInfo.style.display = "none";
    }
    PT.updateVisibility();
    PT.updateUrlPreview();
  }

  function handleModeChanged(msg) {
    if (!msg.success) {
      PT.showStatus(PT.saveResult, "\u274C " + (msg.error || "Failed"), "error");
    }
  }

  function handleProxySaved(msg) {
    PT.saveProxyBtn.classList.remove("loading");
    PT.saveProxyBtn.disabled = false;
    if (msg.success) {
      PT.showStatus(PT.saveResult, "\u2705 Proxy saved", "success");
    } else {
      PT.showStatus(PT.saveResult, "\u274C " + (msg.error || "Save failed"), "error");
    }
  }

  function handleCredsSaved(msg) {
    PT.saveCredsBtn.classList.remove("loading");
    PT.saveCredsBtn.disabled = false;
    if (msg.success) {
      PT.showStatus(PT.credsResult, "\u2705 Credentials saved", "success");
      PT.passwordInput.value = "";
      PT.passwordInput.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (Saved)";
    } else {
      PT.showStatus(PT.credsResult, "\u274C " + (msg.error || "Failed"), "error");
    }
  }

  function handleCredsCleared(msg) {
    if (msg.success) {
      PT.showStatus(PT.credsResult, "\u2705 Credentials cleared", "success");
      PT.usernameInput.value = "";
      PT.passwordInput.value = "";
      PT.passwordInput.placeholder = "Enter password...";
    }
  }

  function handleTestResult(msg) {
    PT.testBtn.classList.remove("loading");
    PT.testBtn.disabled = false;
    var text = msg.success ? "\u2705 " : "\u274C ";
    text += msg.message;
    if (msg.latencyMs) { text += " (" + msg.latencyMs + "ms)"; }
    PT.showStatus(PT.testResult, text, msg.success ? "success" : "error");
  }

  function handleDetected(msg) {
    PT.detectBtn.classList.remove("loading");
    PT.detectBtn.disabled = false;
    if (msg.url) {
      PT.showStatus(PT.testResult, "\u2139\uFE0F System proxy: " + msg.url, "success");
    } else {
      PT.showStatus(PT.testResult, "\u26A0\uFE0F No system proxy detected", "warning");
    }
  }

  // ── Init: Request proxy state when tab loads ─────────────────────

  var proxyTab = document.getElementById("tab-proxy");
  if (proxyTab) {
    proxyTab.addEventListener("click", function () {
      vscode.postMessage({ type: "getProxyState" });
    });
  }

  // Also request state immediately in case proxy tab is already active
  setTimeout(function () {
    vscode.postMessage({ type: "getProxyState" });
  }, 100);

  // Apply initial visibility based on default mode
  PT.updateVisibility();
})();
