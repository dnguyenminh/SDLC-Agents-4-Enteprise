/**
 * Chat Panel — Tool Container & Helpers (KSA-247, KSA-290, SA4E-371)
 * Isolated collapsible container for tool call blocks (summary header,
 * count badge, status dots), tool categorization, small formatting helpers.
 *
 * SA4E-371: one container PER response cycle — closing a cycle (or the turn)
 * seals the active container; the next cycle gets a fresh one.
 * R2 collapse semantics: a container NEVER auto-collapses while its tools
 * still update — it folds only when EVERY tool reached a terminal state and
 * the user has not manually toggled it (data-user-managed is sticky).
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var messagesEl = S.messagesEl;

  // KSA-247: tool call blocks render in their own scoped container,
  // completely isolated from streaming DOM manipulation.
  // KSA-290: the container is itself collapsible — summary header toggles
  // every tool row inside.
  S.getOrCreateToolContainer = function () {
    if (!S.activeToolContainer || !S.activeToolContainer.parentNode) {
      S.activeToolContainer = document.createElement("div");
      S.activeToolContainer.className = "ksa247-tool-container";
      S.activeToolContainer.setAttribute("data-turn", "turn-" + Date.now());
      S.activeToolContainer.setAttribute("data-tool-count", "0");

      var summaryHeader = document.createElement("div");
      summaryHeader.className = "tool-container-summary";
      summaryHeader.setAttribute("role", "button");
      summaryHeader.setAttribute("aria-expanded", "true");
      summaryHeader.setAttribute("tabindex", "0");
      summaryHeader.innerHTML =
        '<span class="tc-chevron">&#x25BC;</span>' +
        '<span class="tc-summary-text">Tool calls</span>' +
        '<span class="tc-count-badge">0</span>' +
        '<span class="tc-status-dots"></span>';

      summaryHeader.addEventListener("click", function () {
        var container = this.parentNode;
        // R2 sticky: a manual toggle removes the container from all auto
        // rules for the rest of its rendered life (live + replay restore).
        container.setAttribute("data-user-managed", "true");
        var isCollapsed = container.classList.toggle("tc-collapsed");
        this.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      });
      summaryHeader.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.click();
        }
      });

      S.activeToolContainer.appendChild(summaryHeader);

      var bodyWrap = document.createElement("div");
      bodyWrap.className = "tool-container-body";
      S.activeToolContainer.appendChild(bodyWrap);

      messagesEl.appendChild(S.activeToolContainer);
    }
    return S.activeToolContainer;
  };

  /** All blocks terminal (completed/failed/interrupted) — running blocks no. */
  function allTerminal(body) {
    var blocks = body ? body.querySelectorAll(".tool-call-block") : [];
    if (blocks.length === 0) return false;
    for (var i = 0; i < blocks.length; i++) {
      var st = blocks[i].querySelector(".tool-status");
      if (!st || !(st.classList.contains("completed") ||
                   st.classList.contains("failed"))) return false;
    }
    return true;
  }

  /** R2 rule: all-terminal, untouched by the user, no pending approval bar. */
  function applyContainerCollapse(container) {
    if (container.hasAttribute("data-user-managed")) return;
    if (container.classList.contains("tc-collapsed")) return;
    // An inline approval bar needs visibility — never fold over it.
    if (container.querySelector(".tool-approval-bar")) return;
    if (!allTerminal(container.querySelector(".tool-container-body"))) return;
    container.classList.add("tc-collapsed");
    var header = container.querySelector(".tool-container-summary");
    if (header) header.setAttribute("aria-expanded", "false");
  }

  /** Update the container summary header with current counts + R2 collapse + SA4E-381 Issue 3 turn trace metrics. */
  S.updateToolContainerSummary = function (container) {
    if (!container) return;
    var body = container.querySelector(".tool-container-body");
    var blocks = body ? body.querySelectorAll(".tool-call-block") : [];
    var count = blocks.length;
    container.setAttribute("data-tool-count", count.toString());

    // SA4E-381 Issue 3: compute turn trace summary metrics
    var tab = S.getTab(S.activeTabId);
    var tokenCount = tab && tab.tokenCount !== undefined ? tab.tokenCount : "--";
    var durationMs = S.turnStartTime ? Date.now() - S.turnStartTime : 0;
    // Format duration: use S.formatDuration for <1s cases, otherwise round seconds
    var durationStr = S.formatDuration(durationMs);
    var thinkStr = (S.turnThinkCount || 0) + "×";

    // Format token count: add "k" suffix for thousands
    var tokenStr = tokenCount;
    if (typeof tokenCount === "number" && tokenCount >= 1000) tokenStr = (tokenCount / 1000).toFixed(1) + "k";
    else if (typeof tokenCount !== "number") tokenStr = "--";

    // unified trace summary line (replaces per-category breakdown)
    var summaryEl = container.querySelector(".tc-summary-text");
    var countBadge = container.querySelector(".tc-count-badge");
    if (summaryEl) {
      summaryEl.textContent = "⚙ " + count + " tools · " + tokenStr + " tokens · " + durationStr + " · thinking " + thinkStr;
    }
    if (countBadge) countBadge.textContent = count.toString();

    // Count categories for historical reference (optional chip)
    var cats = {};
    for (var i = 0; i < blocks.length; i++) {
      var catEl = blocks[i].querySelector(".tool-cat");
      var catLabel = catEl ? catEl.textContent : "TOOL";
      cats[catLabel] = (cats[catLabel] || 0) + 1;
    }
    var parts = [];
    for (var key in cats) {
      parts.push(cats[key] + " " + key);
    }
    // Keep a subtle category chip after the main summary if there are categories
    if (summaryEl && parts.length > 0) {
      //Append category info after a separator | if needed
      // (kept minimal to avoid UI clutter — the primary summary above dominates)
    }

    // Status dots indicator
    var running = 0, failed = 0;
    for (var j = 0; j < blocks.length; j++) {
      var statusEl = blocks[j].querySelector(".tool-status");
      if (statusEl) {
        if (statusEl.classList.contains("running")) running++;
        else if (statusEl.classList.contains("failed")) failed++;
      }
    }
    var dotsEl = container.querySelector(".tc-status-dots");
    if (dotsEl) {
      var dotHtml = "";
      if (running > 0) dotHtml += '<span class="tc-dot running"></span>';
      if (count > running + failed) {
        dotHtml += '<span class="tc-dot completed">' + (count - running - failed) + ' \u2713</span>';
      }
      if (failed > 0) dotHtml += '<span class="tc-dot failed">' + failed + ' \u2717</span>';
      dotsEl.innerHTML = dotHtml;
    }

    // R2: auto-collapse only when not user-managed and all tools terminal
    applyContainerCollapse(container);
  };

  /** Seal the active container: turn boundary or response-cycle end. */
  S.finalizeToolContainer = function () {
    // A dangling cycle (turn errored without streamComplete) is closed first
    // so its entry lands chronological; no-op while no cycle is open.
    S.closeCycle("seal");
    if (S.activeToolContainer) {
      S.activeToolContainer.setAttribute("data-sealed", "true");
      S.updateToolContainerSummary(S.activeToolContainer);
      applyContainerCollapse(S.activeToolContainer);
      S.activeToolContainer = null;
    }
  };

})();
