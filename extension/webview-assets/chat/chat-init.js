/**
 * Chat Panel — Init
 * MUST load last: performs the initial tab bar render and sends the
 * "ready" handshake to the extension host (same order as the original
 * chat.js IIFE tail).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  // Initialization
  S.renderTabBar();

  // Initialize scroll-to-bottom button
  if (S.initScrollToBottomButton) S.initScrollToBottomButton();

  // === Initialization ===
  S.vscode.postMessage({ type: "ready" });
})();