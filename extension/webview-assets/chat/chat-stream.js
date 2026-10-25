/**
 * Chat Panel — Streaming (KSA-247 + SA4E-371 response cycles)
 * One cycle per model response: thinking block → answer bubble → tool
 * container (machinery + persistence live in chat-cycle.js). This file maps
 * chat:streamChunk / chat:streamComplete onto the open response cycle.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var messagesEl = S.messagesEl;

  // === Streaming (one group per model response within the turn) ===
  // SA4E-381 routing: targetTabId is the TURN's tab (originTabId). Data
  // (cycle entry, thinking/text buffers) always updates the owning tab's
  // model — even while the user views another tab; DOM rendering only
  // happens while that tab is active, so nothing is dropped and nothing
  // leaks into the viewed tab's transcript.
  S.handleStreamChunk = function (msg, targetTabId) {
    targetTabId = targetTabId || S.getMessageTargetTabId(msg);
    var tab = S.getTab(targetTabId);
    if (!tab) return; // turn's tab was closed — nothing to render or persist
    var render = targetTabId === S.activeTabId;

    if (render) {
      S.showMessages();
      S.setWorking(true, "Working...");
    }

    if (msg.eventType === "status") {
      // Node lifecycle signal (e.g. "active") — working bar only, never
      // concatenated into the reply bubble (KSA-237).
      if (render) {
        S.setWorking(true, S.statusLabel(msg.nodeId, msg.content));
        S.scrollToBottom();
      }
      return;
    }

    if (msg.eventType === "error") {
      renderCycleError(msg, targetTabId);
      return;
    }

    // SA4E-371 cycle rule: a thinking/token delta after >=1 tool call (or a
    // different node's stream) closes the current cycle and opens the next.
    S.maybeCloseCycle(msg.nodeId, targetTabId);
    var c = S.ensureCycle(msg.nodeId, targetTabId);

    if (msg.eventType === "token") {
      // Append verbatim — whitespace-only tokens carry markdown structure
      // (blank lines between paragraphs, code indentation). Dropping them
      // corrupts the final message (UAT: collapsed text, broken tables).
      if (msg.content) {
        c.content += msg.content;
        if (c.entry) c.entry.content = c.content; // R2: live entry mutation
      }
      if (render) {
        S.ensureBubble(c);
        c.contentEl.innerHTML = MarkdownRenderer.render(c.content);
        S.addCodeActions(c.contentEl);
      }
    } else if (msg.eventType === "thinking") {
      // Reasoning delta — streaming collapsible block preceding the bubble.
      // No auto-collapse while it still streams (R2); the cycle settles it.
      // SA4E-381 Issue 3: track thinking count per turn
      S.turnThinkCount = (S.turnThinkCount || 0) + 1;
      c.thinkingText += msg.content || "";
      if (c.entry) c.entry.thinking = c.thinkingText; // R2: live entry mutation
      if (render) {
        S.ensureThinking(c);
        // SA4E-381 Issue 2: follow-only-at-bottom — never yank the body
        // scroll when the user scrolled up to read earlier reasoning.
        var tb = c.thinkingBody;
        var atBodyBottom = tb.scrollHeight - tb.scrollTop - tb.clientHeight < 24;
        tb.textContent = c.thinkingText;
        if (atBodyBottom) tb.scrollTop = tb.scrollHeight;
      }
    }

    if (render) {
      // SA4E-381 Issue 2: follow-only-at-bottom — only auto-scroll when the
      // user is at (or within 80px of) the bottom; otherwise show the jump
      // pill so they can resume follow with one click.
      var atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
      if (atBottom) {
        S.scrollToBottom();
        if (S.showJumpPill) S.showJumpPill(false);
      } else if (S.showJumpPill) {
        S.showJumpPill(true);
      }
    }
  };

  /** chat:streamChunk eventType "error" — rendered inside the cycle bubble. */
  function renderCycleError(msg, targetTabId) {
    var render = targetTabId === S.activeTabId;
    var c = S.ensureCycle(msg.nodeId, targetTabId);
    if (render) {
      S.ensureBubble(c);
      c.bubbleEl.classList.add("error");
      c.bubbleEl.classList.remove("streaming");
      c.contentEl.innerHTML = MarkdownRenderer.render("**Error:** " + msg.content);
    }
    // Node errors are NOT persisted here (original behavior) — the separate
    // chat:error path owns error persistence + diagnosis (SA4E-369).
    S.closeCycle("error", targetTabId);
    if (render) S.scrollToBottom();
  }

  // === Turn completion (chat:streamComplete arrives once per turn) ===
  S.handleStreamComplete = function (msg, targetTabId) {
    targetTabId = targetTabId || S.getMessageTargetTabId(msg);
    // Close the open response cycle: settle thinking, finish bubble, push
    // the per-cycle assistant entry. Tool-only trailing cycles persist
    // nothing; their container was already sealed by maybeCloseCycle.
    S.closeCycle("turn-end", targetTabId);
    if (targetTabId === S.activeTabId) {
      S.finalizeToolContainer();
      // SA4E-381 Issue 3: close the per-turn work-trace (auto-collapse unless
      // the user toggled it during the turn — sticky data-user-managed).
      if (S.closeTrace) S.closeTrace("stream-complete");
      // SA4E-372 R1: a turn with no replayed cycle (e.g. an error turn) has
      // nothing to adopt — drop orphan tracking, containers stay at root.
      S.preCycleContainers = [];
    }
    // Don't touch the working bar — only chat:workingStatus controls it
    // (prevents premature hide when verify loops back).
    S.isStreaming = false;
    // Streaming ended — hide the jump pill if it was showing.
    if (S.showJumpPill) S.showJumpPill(false);
  };
})();
