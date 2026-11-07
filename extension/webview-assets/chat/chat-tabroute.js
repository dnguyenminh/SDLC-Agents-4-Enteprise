/**
 * Chat Panel — Per-Tab Stream Routing (SA4E-391 flat renderer)
 * Single choke point S.routeStreamEvent(msg): every tab-scoped stream event
 * (streamChunk / streamComplete / toolCall / toolCallUpdate) is dispatched to
 * the flat renderer, which always updates the OWNING tab's model and renders
 * DOM only while that tab is active. Background turns bump the unread pill.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  S.routeStreamEvent = function (msg) {
    var targetTabId = S.getMessageTargetTabId(msg);
    var tab = S.getTab(targetTabId);
    if (!tab) return;
    var isActive = targetTabId === S.activeTabId;

    switch (msg.type) {
      case "chat:streamChunk":
        if (!isActive) tab.streaming = true;
        S.handleStreamChunk(msg, targetTabId);
        break;
      case "chat:streamComplete":
        S.handleStreamComplete(msg, targetTabId);
        if (!isActive) { tab.streaming = false; tab.unread = (tab.unread || 0) + 1; }
        break;
      case "chat:toolCall":
        if (!isActive) tab.streaming = true;
        // SA4E-391 Bug 2: a tool call is a chronological boundary — close the
        // live thinking/answer blocks BEFORE the tool block is appended, so the
        // post-tool text opens a NEW block AFTER the tool instead of merging
        // into the pre-tool answer (which pushed the tool block to the end).
        if (S.flushLiveBlocks) S.flushLiveBlocks(targetTabId);
        // Count the tool against the live turn so turn-meta can show "N tools".
        if (tab.live) tab.live.toolCount = (tab.live.toolCount || 0) + 1;
        S.renderToolCall(msg.toolCall, false, msg.requiresApproval, targetTabId);
        break;
      case "chat:toolCallUpdate":
        S.updateToolCall(msg, targetTabId);
        break;
    }

    if (!isActive) {
      if (S.renderTabBar) S.renderTabBar();
      S.saveStateToDisk();
    }
  };
})();
