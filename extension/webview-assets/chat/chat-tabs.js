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

    // Clear message area and re-render target tab messages
    messagesEl.innerHTML = "";
    S.activeToolContainer = null; // Reset container on tab switch
    if (tab && tab.messages && tab.messages.length > 0) {
      S.showMessages();
      for (var i = 0; i < tab.messages.length; i++) {
        var msg = tab.messages[i];
        if (msg.role === "tool" && msg.toolData) {
          S.renderToolCall(msg.toolData, true);
        } else {
          S.finalizeToolContainer();
          S.appendMessage(msg.role, msg.content, msg.nodeId, msg);
        }
      }
      S.finalizeToolContainer();
      // Restore scroll position
      if (tab.scrollPosition) {
        messagesEl.scrollTop = tab.scrollPosition;
      }
    } else {
      // Empty tab — show welcome state
      messagesEl.classList.add("hidden");
      welcomeEl.classList.remove("hidden");
      S.hasMessages = false;
    }

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

      var label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.name;
      el.appendChild(label);

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
