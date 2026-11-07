/**
 * Chat Panel — Streaming (SA4E-391 flat renderer)
 * Maps chat:streamChunk / chat:streamComplete onto a per-tab "live turn".
 * thinking deltas accumulate into one thinking block; answer tokens accumulate
 * into one answer block. A tool call between deltas flushes the current answer
 * so blocks stay in true chronological order. On complete, any buffered answer
 * is finalized (and the non-streaming fallback text, if any, is shown).
 *
 * Per-tab live state lives on tab.live = { thinking, answer, nodeId, startedAt,
 * toolCount }. DOM renders only while the owning tab is active; data always
 * updates the owning tab so a background turn replays correctly on switch.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  function live(tab) {
    if (!tab.live) tab.live = { thinkingEntry: null, answerEntry: null, nodeId: "pi", startedAt: Date.now(), toolCount: 0 };
    return tab.live;
  }

  /** Re-render an in-place entry (thinking/answer) when visible. */
  function refresh(entry, tabId) {
    if (tabId !== S.activeTabId) return;
    if (!entry._el) return;
    if (entry.role === "thinking") {
      // Throttle thinking re-render to avoid UI lag on fast reasoning streams.
      var now = Date.now();
      if (!entry._lastThinkRender) entry._lastThinkRender = 0;
      if (now - entry._lastThinkRender < 150) return;
      entry._lastThinkRender = now;
      requestAnimationFrame(function () {
        if (!entry._el) return;
        var body = entry._el.querySelector(".oc-think-body");
        var head = entry._el.querySelector(".oc-think-head");
        if (body) S.renderThinkingBody(body, entry.text);
        if (head) head.textContent = "Thought" + (entry.durationMs ? ": " + S.fmtDur(entry.durationMs) : "");
      });
    } else if (entry.role === "assistant") {
      // CHAT-STREAM-THROTTLE: throttle markdown re-render to ~300ms to avoid O(n²)
      // on long streaming answers. Accumulate tokens and render in batches.
      var now = Date.now();
      if (!entry._lastRender) entry._lastRender = 0;
      if (now - entry._lastRender < 300 && entry._pendingContent === entry.content) {
        return; // throttle: skip this render, will catch up on next token or final
      }
      entry._lastRender = now;
      entry._pendingContent = entry.content;
      // Yield to event loop to keep UI responsive during streaming (allows tab switching).
      requestAnimationFrame(function () {
        if (!entry._el) return;
        entry._el.innerHTML = (window.MarkdownRenderer)
          ? MarkdownRenderer.render(entry.content)
          : S.escapeHtml(entry.content);
        if (S.addCodeActions) { try { S.addCodeActions(entry._el); } catch (e) {} }
      });
    }
  }

  /**
   * SA4E-391 Bug 2: close the live thinking/answer blocks of a tab.
   *
   * A tool call is a CHRONOLOGICAL boundary: the text streamed before it and
   * the text streamed after it are two distinct response segments. Without
   * this flush the second segment kept appending to the FIRST answer block,
   * so the transcript read "answer → tool → answer" as a single answer block
   * with the tool blocks trailing AFTER it — the tool block appeared after the
   * response it belongs between.
   *
   * After the flush the next delta opens a NEW block, which lands after the
   * tool block (the tool block is appended synchronously).
   */
  S.flushLiveBlocks = function (targetTabId) {
    targetTabId = targetTabId || S.activeTabId;
    var tab = S.getTab(targetTabId);
    if (!tab || !tab.live) return;
    tab.live.answerEntry = null;
    tab.live.thinkingEntry = null;
  };

  S.handleStreamChunk = function (msg, targetTabId) {
    targetTabId = targetTabId || S.getMessageTargetTabId(msg);
    var tab = S.getTab(targetTabId);
    if (!tab) return;
    var L = live(tab);
    L.nodeId = msg.nodeId || L.nodeId;

    if (msg.eventType === "status") {
      if (targetTabId === S.activeTabId) S.setWorking(true, S.statusLabel(msg.nodeId, msg.content));
      return;
    }

    if (msg.eventType === "error") {
      // Flush any partial answer, then show the error as an answer block.
      S.appendBlock(targetTabId, { role: "assistant", content: "**Error:** " + (msg.content || ""), nodeId: L.nodeId });
      tab.live = null;
      return;
    }

    if (msg.eventType === "thinking") {
      // A thinking delta after the answer started = a new response → flush answer.
      if (L.answerEntry) { L.answerEntry = null; }
      if (!L.thinkingEntry) {
        L.thinkStart = Date.now();
        L.thinkingEntry = { role: "thinking", text: "", durationMs: 0 };
        S.appendBlock(targetTabId, L.thinkingEntry);
      }
      L.thinkingEntry.text += msg.content || "";
      L.thinkingEntry.durationMs = Date.now() - (L.thinkStart || Date.now());
      refresh(L.thinkingEntry, targetTabId);
      if (targetTabId === S.activeTabId) { S.setWorking(true, "Thinking…"); S.scrollIfAtBottom(); }
      return;
    }

    if (msg.eventType === "token") {
      // A new token after a thinking block settles it (keep it rendered).
      if (L.thinkingEntry) { L.thinkingEntry = null; }
      if (!L.answerEntry) {
        L.answerStart = Date.now();
        L.answerEntry = { role: "assistant", content: "", nodeId: L.nodeId };
        S.appendBlock(targetTabId, L.answerEntry);
      }
      if (msg.content) {
        L.answerEntry.content += msg.content;
        refresh(L.answerEntry, targetTabId);
      }
      if (targetTabId === S.activeTabId) { S.setWorking(true, "Working…"); S.scrollIfAtBottom(); }
    }
  };

  S.handleStreamComplete = function (msg, targetTabId) {
    targetTabId = targetTabId || S.getMessageTargetTabId(msg);
    var tab = S.getTab(targetTabId);
    if (!tab) return;
    var L = live(tab);

    // Non-streaming fallback: a reply that never streamed tokens arrives whole
    // in finalContent — show it so the answer is never lost (SA4E-391).
    var finalText = msg && typeof msg.finalContent === "string" ? msg.finalContent : "";
    var isPlaceholder = /^Node .+ completed in \d+ms$/.test(finalText);
    if (!L.answerEntry && finalText && !isPlaceholder) {
      L.answerEntry = { role: "assistant", content: finalText, nodeId: L.nodeId };
      S.appendBlock(targetTabId, L.answerEntry);
    }

    // SA4E-391: a turn that produced NOTHING (no thinking, no tool, no answer)
    // must not leave the panel looking frozen — surface an explicit notice.
    var producedNothing = !L.answerEntry && !L.thinkingEntry && !(L.toolCount > 0);
    if (producedNothing) {
      S.appendBlock(targetTabId, {
        role: "assistant",
        content: "_(The model returned no output for this turn.)_",
        nodeId: L.nodeId,
      });
    }

    // CHAT-LOOP-CONT: if there's a thinking block, update it with stopReason badge (e.g., "length").
    if (L.thinkingEntry) {
      var stopReason = msg && msg.metadata && msg.metadata.stopReason;
      L.thinkingEntry.stopReason = stopReason;
      // Re-render the thinking block to show the stopReason badge.
      if (L.thinkingEntry._el) {
        var head = L.thinkingEntry._el.querySelector(".oc-think-head");
        if (head) {
          // Remove existing badge if any.
          var oldBadge = head.querySelector(".oc-think-stop-badge");
          if (oldBadge) oldBadge.remove();
          // CHAT-LOOP-CONT: show stopReason badge (e.g., "length" = output token limit).
          if (stopReason === "length") {
            var badge = document.createElement("span");
            badge.className = "oc-think-stop-badge";
            badge.textContent = "Output limit reached";
            badge.title = "The model hit the output token limit. Auto-continuation was attempted.";
            head.appendChild(badge);
          }
        }
      }
    }

    // Attach turn metrics to the answer block (duration from metadata).
    if (L.answerEntry) {
      var dur = msg && msg.metadata && msg.metadata.duration;
      if (dur) L.answerEntry.durationMs = dur;
      if (L.toolCount) L.answerEntry.toolCount = L.toolCount;
      if (targetTabId === S.activeTabId && L.answerEntry._el && (dur || L.toolCount)) {
        var old = L.answerEntry._el.querySelector(".oc-turn-meta");
        if (old) old.remove();
        L.answerEntry._el.appendChild(S.buildTurnMeta(L.answerEntry));
      }
      S.saveStateToDisk();
    }

    tab.live = null;
    S.isStreaming = false;
    if (S.showJumpPill) S.showJumpPill(false);
  };
})();