/**
 * Chat Panel — Tool Call Update (chat:toolCallUpdate)
 * Live status/result/duration updates on a rendered tool block, terminal
 * state handling (Fix J approval cleanup, FIX F stub replacement), tab
 * model sync.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  S.updateToolCall = function (msg) {
    var block = S.toolCalls[msg.id];
    if (!block) {
      console.warn("[chat.js] updateToolCall: block not found for id", msg.id);
      return;
    }

    // Update status indicator
    var statusSpan = block.querySelector(".tool-status");
    statusSpan.className = "tool-status " + msg.status;
    statusSpan.textContent = S.statusIcon(msg.status);

    // Update aria-label
    var toolName = block.querySelector(".tool-name");
    block.setAttribute("aria-label", "Tool call: " +
      (toolName ? toolName.textContent : "") + " - " + msg.status);

    // Update Response section content (KSA-281: keep Request visible)
    // FIX F: a terminal status ALWAYS replaces "(waiting...)" — zero-output
    // tools send no result text, so fall back instead of leaving the stub.
    if (msg.status === "completed" || msg.status === "failed") {
      // Fix J: the gated tool reached a terminal state (executed, blocked, or
      // gate timed out) — drop any stale Approve/Reject for it.
      if (S.pendingApproval && S.pendingApproval.toolId === msg.id) {
        S.hideApprovalButtons();
      }
      var resSection = block.querySelector(".tool-section-response");
      if (resSection) {
        var resContent = resSection.querySelector(".tool-section-content");
        if (resContent) {
          resContent.textContent =
            msg.error || msg.result ||
            (msg.status === "failed" ? "(failed — no output)" : "(no output)");
        }
        if (msg.status === "failed") {
          resSection.classList.add("failed");
        } else {
          resSection.classList.remove("failed");
        }
      }
    }

    // Duration display - guard against duplicates (OI-6)
    if (msg.duration) {
      var existingDur = block.querySelector(".tool-duration");
      if (!existingDur) {
        var dur = document.createElement("span");
        dur.className = "tool-duration";
        dur.textContent = S.formatDuration(msg.duration);
        block.querySelector(".tool-call-header").appendChild(dur);
      } else {
        existingDur.textContent = S.formatDuration(msg.duration);
      }
    }

    // SA4E-371 (R2): a TERMINAL tool folds its OWN block unless the user
    // toggled it manually (data-user-managed is sticky — auto rules stop).
    if ((msg.status === "completed" || msg.status === "failed") &&
        !block.hasAttribute("data-user-managed") &&
        block.classList.contains("expanded")) {
      block.classList.remove("expanded");
      block.setAttribute("aria-expanded", "false");
    }

    // KSA-290: Update container summary to reflect new status counts
    var container = block.closest(".ksa247-tool-container");
    if (container) S.updateToolContainerSummary(container);

    // Update persisted state in tab
    var currentTab = S.getTab(S.activeTabId);
    if (currentTab && currentTab.messages) {
      for (var i = currentTab.messages.length - 1; i >= 0; i--) {
        var m = currentTab.messages[i];
        if (m.role === "tool" && m.toolData && m.toolData.id === msg.id) {
          m.toolData.status = msg.status;
          if (msg.result) m.toolData.result = msg.result;
          // SA4E-369: failed tools carry their error text in msg.error —
          // persisted so exports show WHY a tool failed, not just "failed".
          if (msg.error) m.toolData.error = msg.error;
          if (msg.duration) m.toolData.duration = msg.duration;
          break;
        }
      }
      S.saveStateToDisk();
    }
  };
})();
