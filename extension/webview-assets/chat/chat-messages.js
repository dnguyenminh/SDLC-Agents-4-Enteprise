/**
 * Chat Panel — Messages area toggle (SA4E-391)
 * Welcome ↔ transcript visibility. Block rendering + full-history replay live
 * in chat-render.js (S.appendBlock / S.renderEntry / S.renderChatHistory).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var messagesEl = S.messagesEl;
  var welcomeEl = S.welcomeEl;

  // === Show messages (hide welcome) ===
  S.showMessages = function () {
    if (!S.hasMessages) {
      if (welcomeEl) welcomeEl.classList.add("hidden");
      if (messagesEl) messagesEl.classList.remove("hidden");
      S.hasMessages = true;
    }
  };

  // Back-compat shim: a few call sites (pipeline cards, resume prompt, errors,
  // hook/steering badges) still call appendMessage for simple one-line rows.
  // Map it onto the flat renderer so nothing double-renders.
  S.appendMessage = function (role, content, nodeId, entry) {
    var e = entry || { role: role, content: content, nodeId: nodeId };
    if (!e.role) e.role = role;
    if (e.content == null) e.content = content;
    S.appendBlock(S.activeTabId, e);
    return null;
  };
})();
