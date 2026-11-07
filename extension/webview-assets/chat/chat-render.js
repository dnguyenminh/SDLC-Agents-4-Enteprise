/**
 * Chat Panel — OpenCode-style flat renderer (SA4E-391).
 * Replaces the per-cycle/work-trace machinery with a simple, sequential block
 * model: every stream event appends ONE block to the active tab's transcript.
 * A turn is a flat list of blocks (user / thinking / tool / answer) — no nested
 * cycles, no trace containers. This is the single source of DOM rendering.
 *
 * Block entry shapes stored in tab.messages:
 *   { role:"user",      content }
 *   { role:"thinking",  text, durationMs }
 *   { role:"tool",      toolData:{ id,name,args,status,result,error,duration } }
 *   { role:"assistant", content, nodeId, durationMs }   (the answer)
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  var AGENT_NAMES = {
    chat: "Pipeline Agent", pi: "Pipeline Agent", sm: "SM", ba: "BA",
    sa: "SA", ta: "TA", qa: "QA", dev: "DEV", devops: "DevOps",
  };

  /** Friendly node label ("pi:c3" -> "Pipeline Agent"). */
  S.nodeLabel = function (id) {
    var base = (id || "pi").toString().split(":")[0];
    return AGENT_NAMES[base] || base.toUpperCase();
  };

  /** Format a ms duration like OpenCode: "37ms" / "2.7s" / "1m 4s". */
  S.fmtDur = function (ms) {
    if (!ms || ms < 0) return "";
    if (ms < 1000) return Math.round(ms) + "ms";
    var s = ms / 1000;
    if (s < 60) return (s < 10 ? s.toFixed(1) : Math.round(s)) + "s";
    var m = Math.floor(s / 60);
    return m + "m " + Math.round(s - m * 60) + "s";
  };

  // === Block builders (pure DOM, no state) =================================

  /** User message — left-aligned, no pill (OpenCode style). */
  S.buildUserBlock = function (content, images) {
    var el = document.createElement("div");
    el.className = "oc-user";
    if (content) {
      var txt = document.createElement("div");
      txt.className = "oc-user-text";
      txt.textContent = content;
      el.appendChild(txt);
    }
    // SA4E-391 multimodal: render attached images as thumbnails in the bubble.
    if (images && images.length) {
      var wrap = document.createElement("div");
      wrap.className = "oc-user-images";
      for (var i = 0; i < images.length; i++) {
        var src = images[i] && (images[i].dataUrl || images[i].uri);
        if (!src) continue;
        var img = document.createElement("img");
        img.className = "oc-user-img";
        img.src = src;
        img.alt = (images[i].name || "image");
        img.title = (images[i].name || "image");
        wrap.appendChild(img);
      }
      el.appendChild(wrap);
    }
    return el;
  };

  /**
   * Normalize thinking text before display: models emit lots of blank lines
   * and trailing whitespace while reasoning, which — with `white-space:
   * pre-wrap` — rendered as huge empty gaps. Collapse 3+ consecutive newlines
   * to a single blank line and trim the ends.
   */
  S.normalizeThinking = function (text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")      // strip trailing spaces per line
      .replace(/\n{3,}/g, "\n\n")      // collapse runs of blank lines
      .trim();
  };

  /** Render thinking body content as markdown (falls back to escaped text). */
  S.renderThinkingBody = function (bodyEl, text) {
    var clean = S.normalizeThinking(text);
    bodyEl.innerHTML = (window.MarkdownRenderer && clean)
      ? MarkdownRenderer.render(clean)
      : S.escapeHtml(clean);
  };

  /** Thinking block — "Thought: Xs" header + grey markdown body, collapsible. */
  S.buildThinkingBlock = function (text, durationMs, stopReason) {
    var el = document.createElement("div");
    el.className = "oc-think";
    var head = document.createElement("div");
    head.className = "oc-think-head";
    head.textContent = "Thought" + (durationMs ? ": " + S.fmtDur(durationMs) : "");
    // CHAT-LOOP-CONT: show stopReason badge (e.g., "length" = output token limit).
    if (stopReason === "length") {
      var badge = document.createElement("span");
      badge.className = "oc-think-stop-badge";
      badge.textContent = "Output limit reached";
      badge.title = "The model hit the output token limit. Auto-continuation was attempted.";
      head.appendChild(badge);
    }
    // Collapsible chevron (like tool calls)
    var chevron = document.createElement("span");
    chevron.className = "oc-think-chevron";
    chevron.textContent = "▾";
    head.appendChild(chevron);
    head.addEventListener("click", function () {
      var isCollapsed = el.classList.toggle("oc-think-collapsed");
      chevron.textContent = isCollapsed ? "▸" : "▾";
    });
    var body = document.createElement("div");
    body.className = "oc-think-body";
    S.renderThinkingBody(body, text);
    el.appendChild(head);
    el.appendChild(body);
    return el;
  };

  /** Answer block — full markdown (tables, headings, code, emphasis). */
  S.buildAnswerBlock = function (content, nodeId) {
    var el = document.createElement("div");
    el.className = "oc-answer";
    el.setAttribute("data-node", nodeId || "pi");
    el.innerHTML = (window.MarkdownRenderer && content)
      ? MarkdownRenderer.render(content)
      : S.escapeHtml(content || "");
    if (S.addCodeActions) { try { S.addCodeActions(el); } catch (e) {} }
    return el;
  };

  // === Transcript append (live) ===========================================

  /** Append a block entry to a tab's model and (if active) render it. */
  S.appendBlock = function (tabId, entry) {
    var tab = S.getTab(tabId || S.activeTabId);
    if (!tab) return null;
    if (!tab.messages) tab.messages = [];
    tab.messages.push(entry);
    if ((tabId || S.activeTabId) === S.activeTabId) {
      S.showMessages();
      S.renderEntry(entry);
      S.scrollIfAtBottom();
    }
    S.saveStateToDisk();
    return entry;
  };

  /** Render a single entry as a DOM block and append to the transcript. */
  S.renderEntry = function (entry) {
    var el = null;
    if (entry.role === "user") {
      el = S.buildUserBlock(entry.content, entry.images);
    } else if (entry.role === "thinking") {
      el = S.buildThinkingBlock(entry.text, entry.durationMs);
    } else if (entry.role === "assistant") {
      el = S.buildAnswerBlock(entry.content, entry.nodeId);
      if (entry.durationMs || entry.toolCount != null) {
        el.appendChild(S.buildTurnMeta(entry));
      }
    } else if (entry.role === "tool" && entry.toolData) {
      // SA4E-391 Bug 2: a LIVE tool block (appended while the call runs) must
      // keep its "running" status; only a REPLAYED block (restored transcript
      // / tab switch) downgrades "running" to "interrupted".
      el = S.buildToolBlock(entry.toolData, !entry.live);
    } else if (entry.role === "error") {
      el = document.createElement("div");
      el.className = "oc-error";
      el.innerHTML = (window.MarkdownRenderer)
        ? MarkdownRenderer.render("**Error:** " + (entry.content || ""))
        : S.escapeHtml("Error: " + (entry.content || ""));
    } else if (entry.role === "peer-inbound") {
      // SA4E-369/391: the receiving tab shows a tinted banner that a peer tab
      // delegated a task here (structural text, never markdown).
      el = document.createElement("div");
      el.className = "oc-peer-inbound";
      el.textContent = entry.content || "";
    } else if (entry.role === "peer-reply") {
      // The receiving tab's auto-run reply to the delegating peer (markdown).
      el = document.createElement("div");
      el.className = "oc-peer-reply";
      var head = document.createElement("div");
      head.className = "oc-peer-reply-head";
      head.textContent = "↩ Reply sent to peer";
      var body = document.createElement("div");
      body.className = "oc-peer-reply-body";
      body.innerHTML = (window.MarkdownRenderer && entry.content)
        ? MarkdownRenderer.render(entry.content)
        : S.escapeHtml(entry.content || "");
      if (S.addCodeActions) { try { S.addCodeActions(body); } catch (e) {} }
      el.appendChild(head);
      el.appendChild(body);
    }
    if (el) { messagesEl.appendChild(el); entry._el = el; }
    return el;
  };

  /** Turn footer metrics: "Pipeline Agent · 14.7s · 2 tools". */
  S.buildTurnMeta = function (entry) {
    var meta = document.createElement("div");
    meta.className = "oc-turn-meta";
    var parts = [S.nodeLabel(entry.nodeId)];
    if (entry.durationMs) parts.push(S.fmtDur(entry.durationMs));
    if (entry.toolCount) parts.push(entry.toolCount + (entry.toolCount === 1 ? " tool" : " tools"));
    meta.textContent = parts.join(" · ");
    return meta;
  };

  /** Scroll to bottom only when the user is already near the bottom. */
  S.scrollIfAtBottom = function () {
    var gap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (gap < 80) { S.scrollToBottom(); if (S.showJumpPill) S.showJumpPill(false); }
    else if (S.showJumpPill) { S.showJumpPill(true); }
  };

  /** Full replay of a tab's transcript (tab switch / restore). */
  S.renderChatHistory = function (messages) {
    messagesEl.innerHTML = "";
    if (!messages || messages.length === 0) return;
    S.showMessages();
    for (var i = 0; i < messages.length; i++) { S.renderEntry(messages[i]); }
    S.scrollToBottom();
  };
})();
