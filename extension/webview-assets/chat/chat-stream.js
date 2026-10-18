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
  S.handleStreamChunk = function (msg) {
    S.showMessages();
    S.setWorking(true, "Working...");

    if (msg.eventType === "status") {
      // Node lifecycle signal (e.g. "active") — working bar only, never
      // concatenated into the reply bubble (KSA-237).
      S.setWorking(true, S.statusLabel(msg.nodeId, msg.content));
      S.scrollToBottom();
      return;
    }

    if (msg.eventType === "error") {
      renderCycleError(msg);
      return;
    }

    // SA4E-371 cycle rule: a thinking/token delta after >=1 tool call (or a
    // different node's stream) closes the current cycle and opens the next.
    S.maybeCloseCycle(msg.nodeId);
    var c = S.ensureCycle(msg.nodeId);

    if (msg.eventType === "token") {
      S.ensureBubble(c);
      // Append verbatim — whitespace-only tokens carry markdown structure
      // (blank lines between paragraphs, code indentation). Dropping them
      // corrupts the final message (UAT: collapsed text, broken tables).
      if (msg.content) {
        c.content += msg.content;
        if (c.entry) c.entry.content = c.content; // R2: live entry mutation
      }
      c.contentEl.innerHTML = MarkdownRenderer.render(c.content);
      S.addCodeActions(c.contentEl);
    } else if (msg.eventType === "thinking") {
      // Reasoning delta — streaming collapsible block preceding the bubble.
      // No auto-collapse while it still streams (R2); the cycle settles it.
      S.ensureThinking(c);
      c.thinkingText += msg.content || "";
      if (c.entry) c.entry.thinking = c.thinkingText; // R2: live entry mutation
      c.thinkingBody.textContent = c.thinkingText;
      c.thinkingBody.scrollTop = c.thinkingBody.scrollHeight;
    }

    S.scrollToBottom();
  };

  /** chat:streamChunk eventType "error" — rendered inside the cycle bubble. */
  function renderCycleError(msg) {
    var c = S.ensureCycle(msg.nodeId);
    S.ensureBubble(c);
    c.bubbleEl.classList.add("error");
    c.bubbleEl.classList.remove("streaming");
    c.contentEl.innerHTML = MarkdownRenderer.render("**Error:** " + msg.content);
    // Node errors are NOT persisted here (original behavior) — the separate
    // chat:error path owns error persistence + diagnosis (SA4E-369).
    S.closeCycle("error");
    S.scrollToBottom();
  }

  // === Turn completion (chat:streamComplete arrives once per turn) ===
  S.handleStreamComplete = function () {
    // Close the open response cycle: settle thinking, finish bubble, push
    // the per-cycle assistant entry. Tool-only trailing cycles persist
    // nothing; their container was already sealed by maybeCloseCycle.
    S.closeCycle("turn-end");
    S.finalizeToolContainer();
    // SA4E-372 R1: a turn with no replayed cycle (e.g. an error turn) has
    // nothing to adopt — drop orphan tracking, containers stay at root.
    S.preCycleContainers = [];
    // Don't touch the working bar — only chat:workingStatus controls it
    // (prevents premature hide when verify loops back).
    S.isStreaming = false;
  };
})();
