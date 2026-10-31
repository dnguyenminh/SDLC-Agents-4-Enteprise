/**
 * Save All Controller Webview Module — Persists all provider configurations to workspace config
 * and SecretStorage atomically.
 */
(function () {
  "use strict";

  var vscode = acquireVsCodeApi();
  var SS = window.SettingsShared = window.SettingsShared || {};

  /** SaveAllController class. */
  function SaveAllController() {}

  /** Save all provider configurations. */
  SaveAllController.prototype.saveAll = function (providers) {
    return vscode.postMessage({
      type: "saveAllProfiles",
      profiles: providers,
    });
  };

  // Expose to SettingsShared
  SS.saveAllController = new SaveAllController();

  // Listen for save result
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (msg.type === "profilesSaved" || msg.type === "saveAllResult") {
      var statusEl = document.getElementById("test-result") || document.getElementById("save-all-status");
      if (statusEl) {
        SS.showStatus(statusEl, msg.success ? ("✅ " + msg.message) : ("❌ " + (msg.error || msg.message)), msg.success ? "success" : "error");
      }
    }
  });
})();