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
      var body = entry._el.querySelector(".oc-think-body");
      var head = entry._el.querySelector(".oc-think-head");
      if (body) S.renderThinkingBody(body, entry.text);
      if (head) head.textContent = "Thought" + (entry.durationMs ? ": " + S.fmtDur(entry.durationMs) : "");
    } else if (entry.role === "assistant") {
      entry._el.innerHTML = (window.MarkdownRenderer)
        ? MarkdownRenderer.render(entry.content)
        : S.escapeHtml(entry.content);
      if (S.addCodeActions) { try { S.addCodeActions(entry._el); } catch (e) {} }
    }
  }

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
