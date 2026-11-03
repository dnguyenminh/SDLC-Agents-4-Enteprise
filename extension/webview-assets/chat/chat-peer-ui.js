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

  /**
   * SA4E-391: append a peer row through the FLAT renderer (appendBlock) so it
   * (a) pushes to tab.messages AND renders when the tab is active, (b) replays
   * correctly on tab switch/restore, and (c) is export-safe. The old
   * appendMessage/.message API was removed in the OpenCode rewrite, which is
   * why the receiving tab showed NOTHING when it helped a peer.
   */

  /** chat:peerInbound — badge + inbound banner block on the receiving tab. */
  S.handlePeerInbound = function (msg) {
    var tab = S.getTab(msg.tabId);
    if (!tab) return;
    // AC4 §5.2: badge increments once per inbound task; clears on focus.
    tab.peerUnread = (tab.peerUnread || 0) + 1;
    // AC4 §5.3: inbound banner + preview, persisted with the tab transcript.
    var prefix =
      "\u2193 Peer task from tab \u2026" + String(msg.fromTabId || "").slice(0, 8) +
      (msg.fromAgentName ? " (" + msg.fromAgentName + ")" : "") +
      " \u2014 " + (msg.preview || ("task " + msg.taskId));
    S.appendBlock(msg.tabId, { role: "peer-inbound", content: prefix, peerTaskId: msg.taskId, timestamp: new Date().toISOString() });
    S.renderTabBar(); // badge dot
  };

  /** chat:peerTurnSettled — reply (or curated failure) block on the receiving tab. */
  S.handlePeerTurnSettled = function (msg) {
    var tab = S.getTab(msg.tabId);
    if (!tab) return;
    var text;
    if (msg.ok) {
      text = msg.text && String(msg.text).trim() ? msg.text : "(peer turn finished with no output)";
    } else {
      text = "[Peer task failed \u2014 " + (msg.error ? msg.error.code + ": " + msg.error.message : "unknown error") + "]";
    }
    S.appendBlock(msg.tabId, { role: "peer-reply", content: text, peerTaskId: msg.taskId, timestamp: new Date().toISOString() });
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
