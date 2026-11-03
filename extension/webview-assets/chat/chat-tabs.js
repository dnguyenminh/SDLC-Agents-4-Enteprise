/**
 * Chat Panel — Tab Model & Bar Rendering (KSA-240)
 * Tab create/switch/close/rename + tab bar DOM rendering.
 * Reads/writes window.ChatState (tabs, activeTabId, messages area).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var messagesEl = S.messagesEl;
  var welcomeEl = S.welcomeEl;
  var tabBar = S.tabBar;
  var tabAddBtn = S.tabAddBtn;

  S.createNewTab = function () {
    if (S.tabs.length >= S.MAX_TABS) return;
    S.tabCounter++;
    // SA4E-391: a new tab INHERITS the current tab's model (not "auto"), so the
    // user's model choice carries over consistently instead of resetting to a
    // server-routed default they can't see.
    var inheritedModel = (S.currentModel && S.currentModel !== "auto") ? S.currentModel : undefined;
    var newTab = { id: crypto.randomUUID(), name: "Chat " + S.tabCounter, messages: [], tokenCount: 0, maxTokens: 128000, model: inheritedModel };
    S.tabs.push(newTab);
    S.switchToTab(newTab.id);
    S.renderTabBar();
    S.saveStateToDisk();
    // SA4E-369: carry the new tab's id + name so the host registers it as a
    // peer immediately. SA4E-391: also carry the inherited model so the new
    // tab's peer capability (e.g. vision) is set from the start.
    vscode.postMessage({ type: "tab:create", payload: { tabId: newTab.id, name: newTab.name, model: inheritedModel } });
  };

  S.switchToTab = function (tabId) {
    if (tabId === S.activeTabId) return;
    // Save current tab state
    var current = S.getTab(S.activeTabId);
    if (current) {
      current.scrollPosition = messagesEl.scrollTop;
    }

    S.activeTabId = tabId;
    var tab = S.getTab(tabId);
    // SA4E-369 AC4: focusing a tab acknowledges its peer activity — badge clears.
    if (tab && tab.peerUnread) {
      tab.peerUnread = 0;
      S.renderTabBar();
    }
    // SA4E-381 Issue 2: if the target tab is still streaming, ignore the saved
    // scroll position and jump to bottom (auto-follow resumes). Otherwise
    // clear the unread badge; streaming flag stays true until streamComplete.
    var wasStreaming = tab && tab.streaming;
    if (tab) {
      tab.unread = 0;
      if (!wasStreaming) tab.streaming = false;
    }

    // SA4E-391: flat replay — rebuild the whole transcript from tab.messages.
    // Live (streaming) entries are already IN tab.messages (appendBlock pushes
    // immediately), so replay shows the in-progress turn too; renderChatHistory
    // re-binds each entry's _el so further stream deltas keep updating in place.
    messagesEl.innerHTML = "";
    if (tab && tab.messages && tab.messages.length > 0) {
      S.hasMessages = false;
      S.renderChatHistory(tab.messages);
      if (!wasStreaming && tab.scrollPosition) {
        messagesEl.scrollTop = tab.scrollPosition;
      } else {
        S.scrollToBottom();
      }
    } else {
      // Empty tab — show welcome state
      messagesEl.classList.add("hidden");
      if (welcomeEl) welcomeEl.classList.remove("hidden");
      S.hasMessages = false;
    }

    if (tab) {
      // Update context icon for this tab
      S.updateContextIcon(tab.tokenCount, tab.maxTokens, tab.breakdown);
      S.lastThreshold = "safe"; // Reset to avoid false pulse
      if (S.updateSidebarTitle) S.updateSidebarTitle(tab.name);
      if (S.updateSidebarContext) S.updateSidebarContext(tab.tokenCount || 0, tab.maxTokens || 0);
      // SA4E-391 per-tab model: restore THIS tab's model in the UI and drive
      // the single host engine config so the viewed tab's model is used.
      if (S.applyTabModel) S.applyTabModel(tab);
    }
    S.renderTabBar();
    vscode.postMessage({ type: "tab:switch", payload: { tabId: tabId } });
  };

  S.closeTab = function (tabId) {
    if (S.tabs.length <= 1) return;
    var idx = -1;
    for (var i = 0; i < S.tabs.length; i++) { if (S.tabs[i].id === tabId) { idx = i; break; } }
    if (idx === -1) return;
    S.tabs.splice(idx, 1);

    if (tabId === S.activeTabId) {
      var newIdx = idx > 0 ? idx - 1 : 0;
      S.activeTabId = S.tabs[newIdx].id;
    }
    S.renderTabBar();
    S.saveStateToDisk();
    vscode.postMessage({ type: "tab:close", payload: { tabId: tabId } });
  };

  S.renameTab = function (tabId, newName) {
    var tab = S.getTab(tabId);
    if (!tab) return;
    var trimmed = (newName || "").trim();
    if (!trimmed) return;
    tab.name = trimmed.substring(0, 30);
    S.renderTabBar();
    S.saveStateToDisk();
    vscode.postMessage({ type: "tab:rename", payload: { tabId: tabId, newName: tab.name } });
  };

  S.getTab = function (tabId) {
    for (var i = 0; i < S.tabs.length; i++) {
      if (S.tabs[i].id === tabId) return S.tabs[i];
    }
    return null;
  };

  S.renderTabBar = function () {
    // Remove all tab items (keep add button)
    var existingTabs = tabBar.querySelectorAll(".tab-item");
    for (var i = 0; i < existingTabs.length; i++) {
      existingTabs[i].remove();
    }

    // Create tab elements
    for (var t = 0; t < S.tabs.length; t++) {
      var tab = S.tabs[t];
      var el = document.createElement("button");
      el.className = "tab-item" + (tab.id === S.activeTabId ? " active" : "");
      el.setAttribute("data-tab-id", tab.id);
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", tab.id === S.activeTabId ? "true" : "false");
      // SA4E-381 Issue 2 AC7: badge info mirrored into aria-label.
      var labelParts = [tab.name];
      if (tab.streaming) labelParts.push("streaming in background");
      else if (tab.unread && tab.unread > 0) labelParts.push(tab.unread + " new messages");
      el.setAttribute("aria-label", labelParts.join(" — "));

      var label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.name;
      el.appendChild(label);

      // SA4E-381 Issue 2: composite tab status badge.
      // Priority 1: streaming dot (violet) > Priority 2: unread count pill > peer badge.
      if (tab.streaming) {
        var statusBadge = document.createElement("span");
        statusBadge.className = "tab-status-badge streaming";
        statusBadge.setAttribute("aria-hidden", "true");
        el.appendChild(statusBadge);
      } else if (tab.unread && tab.unread > 0) {
        var countBadge = document.createElement("span");
        countBadge.className = "tab-status-badge unread";
        countBadge.textContent = tab.unread;
        countBadge.setAttribute("aria-label", tab.unread + " new messages");
        el.appendChild(countBadge);
      }

      // SA4E-369 AC4: unread peer-inbound badge (clears on tab focus).
      if (S.renderTabPeerBadge) S.renderTabPeerBadge(tab, el);

      if (S.tabs.length > 1) {
        var closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.setAttribute("aria-label", "Close tab");
        closeBtn.innerHTML = "\x26times;";
        closeBtn.setAttribute("data-tab-id", tab.id);
        el.appendChild(closeBtn);
      }

      tabBar.insertBefore(el, tabAddBtn);
    }

    // Update add button state
    tabAddBtn.disabled = S.tabs.length >= S.MAX_TABS;
    tabAddBtn.title = S.tabs.length >= S.MAX_TABS ? "Maximum 10 tabs" : "New conversation (Ctrl+Shift+T)";

    // Bind events
    S.bindTabEvents();
  };
})();
