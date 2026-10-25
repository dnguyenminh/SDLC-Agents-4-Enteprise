/**
 * Chat Panel — Response-Cycle Machinery (SA4E-371)
 * A turn's agent loop emits responses: thinking deltas → answer tokens →
 * tool calls → next response. Every response renders as its OWN group:
 * thinking block + answer bubble + per-cycle tool container.
 *
 * Cycle k closes when a thinking/token delta arrives after the cycle already
 * rendered >= 1 tool call (or another node's deltas start), or when the turn
 * ends. Per-cycle entries persist chronologically and replay as-is.
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  var AGENT_NAMES = {
    chat: "Pipeline Agent", sm: "SM", ba: "BA", sa: "SA",
    ta: "TA", qa: "QA", dev: "DEV", devops: "DevOps"
  };

  /** Badge label for a node/cycle id ("pi:c3" → "PI", "chat" → "Pipeline Agent"). */
  S.cycleBadgeText = function (id) {
    var base = (id || "").split(":")[0];
    return AGENT_NAMES[base] || base.toUpperCase();
  };

  function appendNode(el) {
    messagesEl.appendChild(el);
    S.scrollToBottom();
  }

  /** Open cycle n+1 for the given node (first delta/tool of a turn).
   *  SA4E-381 routing: the cycle AND its persisted entry bind to the
   *  TURN's tab (originTabId) — not the tab the user happens to view.
   *  Data always lands in the owning tab's model; DOM renders only while
   *  that tab is active (see the render gate in chat-stream.js). */
  S.openCycle = function (nodeId, tabId) {
    var targetTabId = tabId || S.activeTabId;
    S.cycleSeq = (S.cycleSeq || 0) + 1;
    var c = {
      cycleId: "c" + S.cycleSeq,
      domId: "pi:c" + S.cycleSeq,
      nodeId: nodeId || "pi",
      thinkingText: "",
      content: "",
      hasTools: false,
      thinkingUser: false,
      thinkingCollapsed: false,
      openedAt: Date.now(),
      entry: {
        role: "assistant",
        content: "",
        nodeId: "pi:c" + S.cycleSeq,
        timestamp: new Date().toISOString()
      }
    };
    var tab = S.getTab(targetTabId);
    if (tab) {
      if (!tab.messages) tab.messages = [];
      tab.messages.push(c.entry);
      tab.currentCycle = c;
    }
    // Orphan-container adoption is a DOM concern — orphan containers only
    // exist in the live (active) view, so only the active tab's cycle
    // adopts them. Background-tab cycles stay data-only.
    if (targetTabId === S.activeTabId) {
      S.adoptPreCycleContainers(c, tab);
      S.currentCycle = c;
    }
    return c;
  };

  /** The open cycle of the turn's tab, creating the first cycle of the
   *  turn lazily. Per-tab state means two tabs can stream in parallel
   *  without clobbering each other's cycles. */
  S.ensureCycle = function (nodeId, tabId) {
    var tab = S.getTab(tabId || S.activeTabId);
    if (tab && tab.currentCycle) return tab.currentCycle;
    return S.openCycle(nodeId, tabId);
  };

  /** The cycle's answer streaming bubble (node badge + markdown content).
   *  Recreated when detached (mid-stream tab switch) WITHOUT losing text. */
  S.ensureBubble = function (c) {
    if (c.bubbleEl && c.bubbleEl.parentNode === messagesEl) return c.bubbleEl;
    var el = document.createElement("div");
    el.className = "message assistant streaming";
    var badge = document.createElement("span");
    badge.className = "node-badge " + c.nodeId;
    badge.textContent = S.cycleBadgeText(c.nodeId);
    el.appendChild(badge);
    var span = document.createElement("span");
    span.className = "stream-content";
    el.appendChild(span);
    c.bubbleEl = el;
    c.contentEl = span;
    if (c.content) span.innerHTML = MarkdownRenderer.render(c.content);
    appendNode(el);
    return el;
  };

  /** Close the open cycle: settle thinking, finish the bubble, then FINALIZE
   *  the entry pushed at open (SA4E-372 R2) — sync final buffers, backfill a
   *  missing timestamp, attach the per-cycle copy action, save. An empty
   *  cycle (no text, no thinking) splices its entry back out of tab.messages.
   */
  S.closeCycle = function (reason, tabId) {
    var targetTabId = tabId || S.activeTabId;
    var tab = S.getTab(targetTabId);
    var c = tab ? tab.currentCycle : null;
    if (!c) return null;
    tab.currentCycle = null;
    if (S.currentCycle === c) S.currentCycle = null;
    if (c.thinkingEl) {
      S.settleThinking(c);
      if (reason !== "error") S.collapseThinking(c);
    }
    if (c.bubbleEl) c.bubbleEl.classList.remove("streaming");
    // SA4E-372 R1: adopted (pre-cycle) containers slot in AFTER this
    // cycle's rendered elements — final order THINK → [bubble] → TOOLS.
    S.placeAdoptedContainers(c);
    var hasText = !!(c.content && c.content.length);
    // SA4E-381 Issue 2: trim before persist — whitespace-only thinking must
    // not create a phantom block, and stored content loses edge whitespace.
    var thinkingTrimmed = (c.thinkingText || "").trim();
    var hasThinking = thinkingTrimmed.length > 0;
    if (!c.entry) return null;
    // Same object pushed at open — mutation, never re-push (replay order).
    // thinkingUser replays the sticky expanded choice (R2); thinkingCollapsed
    // replays the user's explicit COLLAPSE (SA4E-381 — direction tracking).
    c.entry.content = hasText ? c.content : "";
    c.entry.thinking = hasThinking ? thinkingTrimmed : undefined;
    if (c.thinkingUser) c.entry.thinkingUser = true;
    if (c.thinkingCollapsed) c.entry.thinkingCollapsed = true;
    if (!c.entry.timestamp) c.entry.timestamp = new Date().toISOString();
    if (!hasText && !hasThinking) {
      // Empty cycle: drop the entry pushed at open (old model persisted
      // nothing for tool-only trailing cycles — same contract). Splice
      // from the OWNING tab, not the tab currently viewed.
      if (tab && tab.messages) {
        var at = tab.messages.indexOf(c.entry);
        if (at !== -1) tab.messages.splice(at, 1);
      }
      return null;
    }
    if (c.bubbleEl && window.ChatExportUI) window.ChatExportUI.attachCopyAction(c.bubbleEl, c.entry);
    S.saveStateToDisk();
    return c.entry;
  };

  /**
   * R2 cycle rule: close the open cycle when a thinking/token delta arrives
   * after it already rendered tool calls, or when a DIFFERENT node's deltas
   * start (pipeline agents stream sequentially — never merge their text).
   */
  S.maybeCloseCycle = function (nodeId, tabId) {
    var targetTabId = tabId || S.activeTabId;
    var tab = S.getTab(targetTabId);
    var c = tab ? tab.currentCycle : null;
    if (!c) return;
    var base = (nodeId || "").split(":")[0];
    if (c.hasTools || (base && base !== (c.nodeId || "").split(":")[0])) {
      S.closeCycle("cycled", targetTabId);
      // Seal the cycle's tool container — it only exists in the live
      // (active) view; a background tab's tools never rendered DOM.
      if (targetTabId === S.activeTabId) S.finalizeToolContainer();
    }
  };

})();