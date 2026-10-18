/**
 * Chat Panel — Init
 * MUST load last: performs the initial tab bar render and sends the
 * "ready" handshake to the extension host (same order as the original
 * chat.js IIFE tail).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  // Initial render
  S.renderTabBar();

  // === Initialization ===
  S.vscode.postMessage({ type: "ready" });
})();
