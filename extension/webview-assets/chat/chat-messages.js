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
    if (entry && entry.thinking) {
      var twrap = document.createElement("div");
      twrap.className = "thinking-block" + (entry.thinkingUser ? "" : " collapsed");
      var thead = document.createElement("div");
      thead.className = "thinking-header";
      thead.innerHTML = '<span class="thinking-chevron">&#9656;</span><span class="thinking-label">Thinking</span>';
      thead.addEventListener("click", function () {
        // R2 sticky: user picked a state — auto rules stop touching it.
        twrap.setAttribute("data-user-managed", "true");
        twrap.classList.toggle("collapsed");
        // SA4E-372 R4: persist the manual choice — replay honors it across
        // reloads (thinkingUser false ⇒ collapsed, true ⇒ expanded).
        if (entry) {
          entry.thinkingUser = !twrap.classList.contains("collapsed");
          S.saveStateToDisk();
        }
      });
      var tbody = document.createElement("div");
      tbody.className = "thinking-body";
      tbody.textContent = entry.thinking;
      twrap.appendChild(thead);
      twrap.appendChild(tbody);
      messagesEl.appendChild(twrap);
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
  };

  S.renderChatHistory = function (messages) {
    messagesEl.innerHTML = "";
    S.activeToolContainer = null; // Reset container on full re-render
    if (messages && messages.length > 0) {
      S.showMessages();
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === "tool" && m.toolData) {
          // Re-render persisted tool call block (into container)
          S.renderToolCall(m.toolData, true);
        } else {
          // Seal tool container before rendering non-tool messages
          S.finalizeToolContainer();
          S.appendMessage(m.role, m.content, m.nodeId, m);
        }
      }
      S.finalizeToolContainer();
    }
  };
})();
