/**
 * Chat Panel — Peer Inbound UI (SA4E-369 AC4)
 * Receiving-tab visibility for peer exchanges:
 *  - chat:peerInbound      → tab badge increment + "[Peer inbound] from …"
 *                            tinted prefix row (with task preview) in the
 *                            receiving tab's transcript
 *  - chat:peerTurnSettled  → the auto-run turn's reply (or curated failure)
 *                            appended below the prefix row
 * Badge clears when the user focuses the tab (switchToTab).
 * Messages persist in the tab state (saveStateToDisk) — replay + export safe.
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  /** Renders one tinted transcript row (prefix or reply). */
  function renderPeerRow(tabId, role, text) {
    if (tabId !== S.activeTabId) return; // passive tab: rows render on switch
    var tab = S.getTab(tabId);
    if (!tab) return;
    if (role === "peer-inbound") {
      messagesEl.appendChild(buildPeerRowEl(role, text));
      S.scrollToBottom();
    } else {
      // Reply rows reuse the standard pipeline (markdown + code actions + scroll).
      S.appendMessage(role, text);
    }
  }

  function buildPeerRowEl(role, text) {
    var el = document.createElement("div");
    el.className = "message " + role;
    var contentEl = document.createElement("span");
    contentEl.innerHTML = role === "peer-inbound"
      ? S.escapeHtml(text) // prefix line is structural text, never Markdown-rendered
      : MarkdownRenderer.render(text);
    if (role !== "peer-inbound") S.addCodeActions(contentEl);
    el.appendChild(contentEl);
    return el;
  }

  /** chat:peerInbound — badge + prefix row. */
  S.handlePeerInbound = function (msg) {
    var tab = S.getTab(msg.tabId);
    if (!tab) return;
    // AC4 §5.2: badge increments once per inbound task; clears on focus.
    tab.peerUnread = (tab.peerUnread || 0) + 1;
    // AC4 §5.3: prefix row + preview, persisted with the tab transcript.
    var prefix =
      "[Peer inbound] from tab \u2026" + String(msg.fromTabId || "").slice(0, 8) +
      (msg.fromAgentName ? " (" + msg.fromAgentName + ")" : "") +
      " \u2014 task " + msg.taskId + (msg.preview ? ": " + msg.preview : "");
    tab.messages.push({ role: "peer-inbound", content: prefix, peerTaskId: msg.taskId });
    renderPeerRow(msg.tabId, "peer-inbound", prefix);
    S.renderTabBar(); // badge dot
    S.saveStateToDisk();
  };

  /** chat:peerTurnSettled — reply (or curated failure) below the prefix row. */
  S.handlePeerTurnSettled = function (msg) {
    var tab = S.getTab(msg.tabId);
    if (!tab) return;
    var text;
    if (msg.ok) {
      text = msg.text && String(msg.text).trim() ? msg.text : "(peer turn finished with no output)";
    } else {
      text = "[Peer task failed \u2014 " + (msg.error ? msg.error.code + ": " + msg.error.message : "unknown error") + "]";
    }
    tab.messages.push({ role: "peer-reply", content: text, peerTaskId: msg.taskId });
    renderPeerRow(msg.tabId, "peer-reply", text);
    S.saveStateToDisk();
  };

  /** Badge dot on the tab pill (renderTabBar in chat-tabs.js calls this). */
  S.renderTabPeerBadge = function (tab, el) {
    if (!tab.peerUnread || tab.peerUnread <= 0) return;
    var b = document.createElement("span");
    b.className = "tab-peer-badge";
    b.textContent = tab.peerUnread > 9 ? "9+" : String(tab.peerUnread);
    b.title = "Inbound from a peer tab (SA4E-369)";
    el.appendChild(b);
  };
})();
