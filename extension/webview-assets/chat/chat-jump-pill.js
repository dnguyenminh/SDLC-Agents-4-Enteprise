/**
 * Chat Panel — Jump-to-Latest Pill (SA4E-381 Issue 2+3)
 * Scroll sentinel: shown when the user scrolls up >80px from the bottom
 * while the tab is streaming. Click → scroll to bottom + resume auto-follow.
 *
 * Public API (on window.ChatState):
 *   S.maybeShowJumpPill()  — call on each streamChunk while streaming; shows
 *                              the pill when scrolled up >80px from bottom.
 *   S.showJumpPill(show)   — programmatic show/hide.
 *   S.setFollowOnly(mode)  — enable/disable auto-follow mode.
 *
 * Depends on chat-core.js (S.messagesEl, S.scrollToBottom, S.isStreaming).
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  var pill = null;
  var followOnly = true; // auto-follow active by default

  function ensurePill() {
    if (pill) return pill;
    pill = document.createElement("button");
    pill.className = "chat-jump-pill";
    pill.setAttribute("hidden", "true");
    pill.setAttribute("aria-label", "Jump to latest — streaming");
    pill.textContent = "\u2193 Jump to latest · streaming";
    pill.addEventListener("click", function () {
      S.scrollToBottom();
      followOnly = true;
      pill.setAttribute("hidden", "true");
    });
    var root = document.getElementById("chat-root");
    if (root) root.appendChild(pill);
    return pill;
  }

  S.showJumpPill = function (show) {
    var p = ensurePill();
    if (!p) return;
    if (show && !followOnly) {
      p.removeAttribute("hidden");
    } else if (!show) {
      p.setAttribute("hidden", "true");
    }
  };

  S.setFollowOnly = function (mode) {
    followOnly = !!mode;
    if (followOnly && pill) pill.setAttribute("hidden", "true");
  };

  /** Call on each streamChunk while streaming. Shows pill when scrolled up. */
  S.maybeShowJumpPill = function () {
    if (!S.isStreaming) {
      S.showJumpPill(false);
      return;
    }
    var atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    if (!atBottom) {
      S.showJumpPill(true);
    } else {
      S.showJumpPill(false);
    }
  };
})();
