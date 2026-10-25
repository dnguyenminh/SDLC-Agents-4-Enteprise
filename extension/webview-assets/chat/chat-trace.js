/**
 * Chat Panel — Work-Trace Lifecycle (SA4E-381 Issue 3)
 * One collapsible work-trace per assistant turn wraps all thinking blocks
 * and tool-call blocks of that turn. Presentation-only wrapper: tab.messages
 * stays flat chronological; the trace only re-parents existing DOM nodes.
 *
 * Public API (on window.ChatState):
 *   S.openTrace(tabId)      — create trace wrapper appended to messagesEl at
 *                              turn start (first thinking/tool of turn).
 *   S.adoptIntoTrace(el)    — move an existing element (thinking block, tool
 *                              container) into the trace body, preserving order.
 *   S.closeTrace(reason)    — seal summary metrics, auto-collapse unless
 *                              data-user-managed (user toggled during turn).
 *   S.updateTraceSummary()  — recompute metrics after each adoption.
 *
 * Depends on chat-core.js (S.messagesEl), chat-tools.js
 * (S.formatDuration via chat-tool-helpers.js).
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  /** Create and append a new open trace for the current turn. */
  S.openTrace = function (tabId) {
    var trace = document.createElement("div");
    trace.className = "work-trace";
    trace.setAttribute("data-turn", "turn-" + Date.now());
    trace.setAttribute("data-state", "running");
    trace.setAttribute("aria-expanded", "true");

    var summary = document.createElement("div");
    summary.className = "trace-summary";
    summary.setAttribute("role", "button");
    summary.setAttribute("tabindex", "0");
    summary.setAttribute("aria-expanded", "true");
    summary.innerHTML =
      '<span class="trace-chevron">&#9656;</span>' +
      '<span class="trace-gear">\u2699</span>' +
      '<span class="trace-text">Work trace</span>' +
      '<span class="trace-metrics">running…</span>' +
      '<span class="tc-status-dots"></span>';

    summary.addEventListener("click", function () {
      toggleTrace(trace);
    });
    summary.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleTrace(trace);
      }
    });

    var body = document.createElement("div");
    body.className = "trace-body";

    trace.appendChild(summary);
    trace.appendChild(body);
    messagesEl.appendChild(trace);

    S.activeTrace = trace;
    S.turnStartTime = Date.now();
    S.updateTraceSummary();
    return trace;
  };

  /** Toggle trace body visibility; sets sticky data-user-managed. */
  function toggleTrace(trace) {
    var nowCollapsed = trace.classList.toggle("tc-collapsed");
    trace.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    var summary = trace.querySelector(".trace-summary");
    if (summary) summary.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    trace.setAttribute("data-user-managed", "true");
    S.updateTraceSummary();
  }

  /** Move an existing element into the open trace body (preserves stream order). */
  S.adoptIntoTrace = function (el) {
    var trace = S.activeTrace;
    if (!trace || !el) return;
    var body = trace.querySelector(".trace-body");
    if (body && el.parentNode && el.parentNode !== body) {
      body.appendChild(el);
    }
    S.updateTraceSummary();
  };

  /** Seal the trace: auto-collapse unless the user took control during the turn. */
  S.closeTrace = function (reason) {
    var trace = S.activeTrace;
    if (!trace) return;
    trace.setAttribute("data-state", "done");
    if (!trace.getAttribute("data-user-managed")) {
      trace.classList.add("tc-collapsed");
      var summary = trace.querySelector(".trace-summary");
      if (summary) summary.setAttribute("aria-expanded", "false");
    }
    S.updateTraceSummary();
    S.activeTrace = null;
  };

  /** Recompute summary metrics (tool count, duration, thinking×, failed count). */
  S.updateTraceSummary = function () {
    var trace = S.activeTrace;
    if (!trace) return;
    var body = trace.querySelector(".trace-body");
    var toolBlocks = body ? body.querySelectorAll(".tool-call-block") : [];
    var thinkingBlocks = body ? body.querySelectorAll(".thinking-block") : [];
    var count = toolBlocks.length;
    var metricsEl = trace.querySelector(".trace-metrics");
    var state = trace.getAttribute("data-state");
    if (!metricsEl) return;
    if (state === "running") {
      var elapsedMs = S.turnStartTime ? Date.now() - S.turnStartTime : 0;
      metricsEl.textContent = "running… " + count + " tools · " +
        (elapsedMs / 1000).toFixed(1) + "s";
    } else {
      var durationStr = S.formatDuration(S.turnStartTime ? Date.now() - S.turnStartTime : 0);
      metricsEl.textContent = count + " tools · ~-- tokens · " +
        durationStr + " · thinking " + (thinkingBlocks.length || 0) + "\u00D7";
    }
    var dotsEl = trace.querySelector(".tc-status-dots");
    if (dotsEl) {
      var failed = 0;
      for (var i = 0; i < toolBlocks.length; i++) {
        var st = toolBlocks[i].querySelector(".tool-status");
        if (st && st.classList.contains("failed")) failed++;
      }
      var dotHtml = "";
      if (failed > 0) dotHtml += '<span class="tc-dot failed">' + failed + ' \u2717</span>';
      dotsEl.innerHTML = dotHtml;
    }
  };
})();
