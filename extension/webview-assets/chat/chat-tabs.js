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
    var newTab = { id: crypto.randomUUID(), name: "Chat " + S.tabCounter, messages: [], tokenCount: 0, maxTokens: 128000 };
    S.tabs.push(newTab);
    S.switchToTab(newTab.id);
    S.renderTabBar();
    S.saveStateToDisk();
    vscode.postMessage({ type: "tab:create" });
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

    // Clear message area and re-render target tab messages
    messagesEl.innerHTML = "";
    S.activeToolContainer = null; // Reset container on tab switch
    S.activeTrace = null; // Reset trace on tab switch
    // SA4E-381 routing: the target tab may have an OPEN streaming cycle
    // (turn started there, user switched away mid-stream). Detach it for
    // the replay below so replay-time seals (finalizeToolContainer →
    // closeCycle "seal") can't close the live cycle, then re-attach its
    // buffered DOM in place and restore it as the open cycle afterwards.
    var liveCycle = tab ? tab.currentCycle : null;
    if (liveCycle) tab.currentCycle = null;
    if (tab && tab.messages && tab.messages.length > 0) {
      S.showMessages();
      for (var i = 0; i < tab.messages.length; i++) {
        var msg = tab.messages[i];
        if (liveCycle && msg === liveCycle.entry) {
          // The open cycle owns its own DOM — re-attach buffered thinking
          // + the partial answer here (chronological position) instead of
          // replaying a duplicate partial bubble. Further deltas continue
          // appending to this DOM once the cycle is restored below.
          // SA4E-381 Issue 3: adopt live-cycle thinking into the open trace.
          if (!S.activeTrace) S.openTrace(S.activeTabId);
          if (liveCycle.thinkingText && String(liveCycle.thinkingText).trim()) {
            S.ensureThinking(liveCycle);
            if (liveCycle.thinkingEl && liveCycle.thinkingEl.parentNode === messagesEl) {
              var tb = S.activeTrace.querySelector(".trace-body");
              if (tb) tb.appendChild(liveCycle.thinkingEl);
            }
          }
          if (liveCycle.content) {
            S.ensureBubble(liveCycle);
            liveCycle.contentEl.innerHTML = MarkdownRenderer.render(liveCycle.content);
            S.addCodeActions(liveCycle.contentEl);
          }
          continue;
        }
        if (msg.role === "user") {
          // User message seals any open trace → new turn boundary.
          if (S.activeTrace) {
            S.closeTrace("turn-boundary");
            S.activeTrace = null;
          }
          S.finalizeToolContainer();
          S.appendMessage(msg.role, msg.content, msg.nodeId, msg);
        } else if (msg.role === "tool" && msg.toolData) {
          // Tool entry: ensure a trace is open, render block, adopt into trace body.
          if (!S.activeTrace) S.openTrace(S.activeTabId);
          S.finalizeToolContainer();
          S.renderToolCall(msg.toolData, true, undefined, S.activeTabId);
          if (S.activeToolContainer && S.activeTrace &&
              S.activeTrace.querySelector(".trace-body")) {
            S.activeTrace.querySelector(".trace-body").appendChild(S.activeToolContainer);
          }
        } else {
          // Non-tool, non-user message: seal container + trace, render at root.
          S.finalizeToolContainer();
          if (S.activeTrace) {
            S.closeTrace("turn-boundary");
            S.activeTrace = null;
          }
          S.appendMessage(msg.role, msg.content, msg.nodeId, msg);
        }
      }
      // Seal any trace left open at end of history.
      if (S.activeTrace) {
        S.closeTrace("end-of-history");
        S.activeTrace = null;
      }
      S.finalizeToolContainer();
      // Restore scroll position — unless the tab is still streaming (jump to bottom instead).
      if (!wasStreaming && tab.scrollPosition) {
        messagesEl.scrollTop = tab.scrollPosition;
      } else if (wasStreaming) {
        S.scrollToBottom();
      }
    } else {
      // Empty tab — show welcome state
      messagesEl.classList.add("hidden");
      welcomeEl.classList.remove("hidden");
      S.hasMessages = false;
    }
    // Restore the live cycle as this tab's open cycle + remirror the
    // active pointer (the mirror always tracks the ACTIVE tab's cycle).
    if (liveCycle && tab) tab.currentCycle = liveCycle;
    S.currentCycle = liveCycle;

    if (tab) {
      // Update context icon for this tab
      S.updateContextIcon(tab.tokenCount, tab.maxTokens, tab.breakdown);
      S.lastThreshold = "safe"; // Reset to avoid false pulse
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
    // SA4E-381 routing: the active-cycle mirror tracks the NEW active tab
    // (the closed tab's open cycle, if any, dies with the tab).
    S.currentCycle = null;
    var newActive = S.getTab(S.activeTabId);
    if (newActive && newActive.currentCycle) S.currentCycle = newActive.currentCycle;
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
