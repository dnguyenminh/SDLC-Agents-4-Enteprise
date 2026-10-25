/**
 * Chat Panel — Tab/Context Sync + Persistence (KSA-240)
 * tab:updated (full model restore), tab:contextUpdate (token gauge),
 * debounced saveStateToDisk.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;

  // === Tab/Context Update Handlers (KSA-240) ===
  S.handleTabsUpdated = function (payload) {
    if (!payload) return;
    if (payload.tabs) {
      S.tabs = payload.tabs.map(function(t) {
        // SA4E-381 Issue 2: restore unread; stale streaming:true (no live
        // stream after webview reload) always resets to false — a new
        // chat:streamChunk will set it again if the turn is still alive.
        return {
          id: t.id, name: t.name, messages: t.messages || [],
          tokenCount: t.tokenCount || 0, maxTokens: t.maxTokens || 128000,
          streaming: false,
          unread: t.unread || 0,
          peerUnread: t.peerUnread || 0
        };
      });
    }
    // Restore input history if provided
    if (payload.messageHistory && Array.isArray(payload.messageHistory)) {
      S.messageHistory = payload.messageHistory;
    } else {
      // Fallback: rebuild history from user messages in all tabs
      S.messageHistory = [];
      for (var ti = 0; ti < S.tabs.length; ti++) {
        var tabMsgs = S.tabs[ti].messages || [];
        for (var mi = 0; mi < tabMsgs.length; mi++) {
          if (tabMsgs[mi].role === "user" && tabMsgs[mi].content) {
            S.messageHistory.push(tabMsgs[mi].content);
          }
        }
      }
      if (S.messageHistory.length > 50) S.messageHistory = S.messageHistory.slice(-50);
    }
    // Update tabCounter to avoid duplicate names
    S.tabCounter = S.tabs.length;

    // Render tab bar first, then switch to active tab to render its messages correctly
    if (payload.activeTabId && S.getTab(payload.activeTabId)) {
      // Force activeTabId to differ so switchToTab actually executes
      S.activeTabId = "";
      S.renderTabBar();
      S.switchToTab(payload.activeTabId);
    } else if (S.tabs.length > 0) {
      S.activeTabId = "";
      S.renderTabBar();
      S.switchToTab(S.tabs[0].id);
    } else {
      S.renderTabBar();
    }
  };

  S.handleContextUpdate = function (payload) {
    if (!payload) return;
    // Update local tab data
    var targetTabId = payload.tabId || S.activeTabId;
    var tab = S.getTab(targetTabId);
    if (!tab) tab = S.getTab(S.activeTabId);
    if (tab) {
      tab.tokenCount = payload.tokenCount;
      tab.maxTokens = payload.maxTokens;
    }
    // Always update icon for active tab when data arrives
    S.updateContextIcon(payload.tokenCount, payload.maxTokens, payload.breakdown);
  };

  // === State Persistence (KSA-240) ===
  var saveTimer = null;

  S.saveStateToDisk = function () {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function() {
      vscode.postMessage({
        type: "chat:saveState",
        payload: { tabs: S.tabs, activeTabId: S.activeTabId, messageHistory: S.messageHistory }
      });
    }, 500);
  };
})();
