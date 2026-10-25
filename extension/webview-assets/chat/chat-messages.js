/**
 * Chat Panel — Message Rendering
 * showMessages (welcome ↔ messages switch), appendMessage (user/assistant/
 * error bubbles with thinking replay + per-message copy), full history
 * re-render.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var messagesEl = S.messagesEl;
  var welcomeEl = S.welcomeEl;

  // === Show messages (hide welcome) ===
  S.showMessages = function () {
    if (!S.hasMessages) {
      welcomeEl.classList.add("hidden");
      messagesEl.classList.remove("hidden");
      S.hasMessages = true;
    }
  };

  // === Message Rendering ===
  S.appendMessage = function (role, content, nodeId, entry) {
    S.showMessages();
    // SA4E-372 R3: think-only cycle entry — replay must match live. A
    // tool-first cycle with no token delta never rendered a bubble
    // (ensureBubble fires on token deltas), so an assistant entry with
    // thinking but NO text renders its Thinking block only — no empty
    // bubble. All other paths keep the existing behavior unchanged.
    var thinkOnly = role === "assistant" &&
      !(content && String(content).trim()) && !!(entry && entry.thinking);

    // SA4E-369: replayed thinking renders as the same collapsed sibling
    // block the live stream produces (chat:streamChunk thinking path).
    // SA4E-371: thinkingUser marks a user-pinned expanded block — the sticky
    // choice survives replay (no auto-collapse ever touches it again).
    // SA4E-381 Issue 2: shared builder + direction tracking. Old entries
    // (no thinkingCollapsed field) keep today's defaults: thinkingUser ⇒
    // expanded+managed, otherwise collapsed (regression-safe mapping).
    var thinkingEl = null;
    if (entry && entry.thinking) {
      var thinkingTrimmed = String(entry.thinking).trim();
      if (thinkingTrimmed) {
        var collapsedDefault = entry.thinkingCollapsed !== undefined
          ? entry.thinkingCollapsed === true
          : !(entry.thinkingUser === true);
        var tb = S.buildThinkingBlockDom(
          thinkingTrimmed,
          collapsedDefault,
          entry.thinkingUser === true,
          null,
          function (nowCollapsed) {
            entry.thinkingCollapsed = nowCollapsed;
            entry.thinkingUser = true;
            S.saveStateToDisk();
          }
        );
        messagesEl.appendChild(tb.wrap);
        thinkingEl = tb.wrap;
        // SA4E-381 Issue 3: adopt thinking block into the open trace body.
        if (S.activeTrace && S.activeTrace.querySelector(".trace-body")) {
          S.activeTrace.querySelector(".trace-body").appendChild(tb.wrap);
        }
      }
    }

    if (!thinkOnly) {
      var el = document.createElement("div");
      el.className = "message " + role;

      if (nodeId) {
        var badge = document.createElement("span");
        var baseId = String(nodeId).split(":")[0]; // "pi:c3" → "pi" (cycle id stripped)
        badge.className = "node-badge " + baseId;
        badge.textContent = S.cycleBadgeText ? S.cycleBadgeText(nodeId) : baseId.toUpperCase();
        el.appendChild(badge);
      }

      var contentEl = document.createElement("span");
      if (role === "user") {
        contentEl.textContent = content;
      } else {
        contentEl.innerHTML = MarkdownRenderer.render(content);
        S.addCodeActions(contentEl);
      }
      el.appendChild(contentEl);

      // SA4E-369: per-message copy (posts the live model entry — the host
      // renders it as Markdown, identical to its section in a full export).
      if (entry && window.ChatExportUI) window.ChatExportUI.attachCopyAction(el, entry);

      messagesEl.appendChild(el);
    }
    S.scrollToBottom();
    return thinkingEl;
  };

  /** Replay a flat chronological message list, grouping contiguous thinking
   *  + tool entries between user messages into one work-trace per turn
   *  (SA4E-381 Issue 3). Trace is presentation-only: tab.messages order is
   *  unchanged — only DOM re-parenting happens. */
  S.renderChatHistory = function (messages) {
    messagesEl.innerHTML = "";
    S.activeToolContainer = null; // Reset container on full re-render
    S.activeTrace = null; // No open trace until we hit a turn
    if (messages && messages.length > 0) {
      S.showMessages();
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === "user") {
          // User message seals any open trace → new turn boundary.
          if (S.activeTrace) {
            S.closeTrace("turn-boundary");
            S.activeTrace = null;
          }
          S.finalizeToolContainer();
          S.appendMessage(m.role, m.content, m.nodeId, m);
        } else if (m.role === "tool" && m.toolData) {
          // Tool entry: ensure a trace is open, render block, adopt into trace body.
          if (!S.activeTrace) S.openTrace(S.activeTabId);
          S.finalizeToolContainer(); // seal previous cycle's container first
          S.renderToolCall(m.toolData, true, undefined, S.activeTabId);
          if (S.activeToolContainer && S.activeTrace &&
              S.activeTrace.querySelector(".trace-body")) {
            S.activeTrace.querySelector(".trace-body").appendChild(S.activeToolContainer);
          }
        } else {
          // Non-tool, non-user message (assistant answer, error, system):
          // seal tool container + any open trace before rendering at root.
          S.finalizeToolContainer();
          if (S.activeTrace) {
            S.closeTrace("turn-boundary");
            S.activeTrace = null;
          }
          S.appendMessage(m.role, m.content, m.nodeId, m);
        }
      }
      // Seal any trace left open at end of history.
      if (S.activeTrace) {
        S.closeTrace("end-of-history");
        S.activeTrace = null;
      }
      S.finalizeToolContainer();
    }
  };
