/**
 * Chat Panel — Per-Tab Stream Routing (SA4E-381 Issue 2+3)
 * Single choke point: S.routeStreamEvent(msg).
 *   - Active tab (originTabId === activeTabId): existing live handlers unchanged.
 *   - Background tab: data-only — mutate the origin tab's model (entries +
 *     thinking/text buffers) + tab.streaming/tab.unread pill counters.
 *     ZERO DOM writes to the viewed tab's transcript.
 * Depends on chat-core.js (S.activeTabId, S.getMessageTargetTabId).
 * All functions are runtime-called (postMessage dispatch), so load order
 * only needs to be after chat-core.js; renderTabBar/saveStateToDisk are
 * guarded for modules that load later.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  S.routeStreamEvent = function (msg) {
    var targetTabId = S.getMessageTargetTabId(msg);
    var render = targetTabId === S.activeTabId;

    if (render) {
      switch (msg.type) {
        case "chat:streamChunk":
          S.handleStreamChunk(msg, targetTabId);
          break;
        case "chat:streamComplete":
          S.handleStreamComplete(msg, targetTabId);
          break;
        case "chat:toolCall":
          S.renderToolCall(msg.toolCall, false, msg.requiresApproval, targetTabId);
          break;
        case "chat:toolCallUpdate":
          S.updateToolCall(msg, targetTabId);
          break;
      }
      return;
    }

    // Background tab — data-only path.
    var tab = S.getTab(targetTabId);
    if (!tab) return;

    switch (msg.type) {
      case "chat:streamChunk":
        tab.streaming = true;
        S.handleStreamChunk(msg, targetTabId);
        break;
      case "chat:streamComplete":
        S.handleStreamComplete(msg, targetTabId);
        tab.streaming = false;
        tab.unread = (tab.unread || 0) + 1;
        break;
      case "chat:toolCall":
        tab.streaming = true;
        S.renderToolCall(msg.toolCall, false, msg.requiresApproval, targetTabId);
        break;
      case "chat:toolCallUpdate":
        S.updateToolCall(msg, targetTabId);
        break;
    }

    if (S.renderTabBar) S.renderTabBar();
    S.saveStateToDisk();
  };
})();
