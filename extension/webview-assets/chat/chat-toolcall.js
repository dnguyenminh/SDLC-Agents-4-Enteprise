/**
 * Chat Panel — Tool Call Block Rendering (KSA-247, KSA-281, KSA-290)
 * One collapsible block per tool call: header (icon/category/status),
 * Request + Response sections, inline approval bar, persistence into the
 * active tab model.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  S.renderToolCall = function (tc, isReplay, requiresApproval) {
    // EF-1: Validation - skip if required fields missing
    if (!tc || !tc.id || !tc.name) {
      console.warn("[chat.js] renderToolCall: missing id or name, skipping", tc);
      return;
    }

    S.showMessages();
    var block = document.createElement("div");
    block.className = "tool-call-block";
    block.id = "tc-" + tc.id;

    // Accessibility: BR-17, OI-2
    block.setAttribute("tabindex", "0");
    block.setAttribute("role", "button");
    block.setAttribute("aria-expanded", "false");
    block.setAttribute("aria-label", "Tool call: " + tc.name + " - " + (tc.status || "running"));

    var cat = S.categorizeTool(tc.name);

    // OI-3: stale running -> interrupted on restore
    var displayStatus = tc.status;
    if (isReplay && tc.status === "running") {
      displayStatus = "interrupted";
    }

    var header = document.createElement("div");
    header.className = "tool-call-header";
    header.innerHTML = '<span class="tool-chevron">&#x25B6;</span>' +
      '<span class="tool-icon">' + cat.icon + '</span>' +
      '<span class="tool-cat ' + cat.cls + '">' + cat.label + '</span>' +
      '<span class="tool-name">' + S.escapeHtml(tc.name) + '</span>' +
      '<span class="tool-status ' + displayStatus + '">' + S.statusIcon(displayStatus) + '</span>';

    // Duration display (for completed/replayed blocks)
    if (tc.duration) {
      var dur = document.createElement("span");
      dur.className = "tool-duration";
      dur.textContent = S.formatDuration(tc.duration);
      header.appendChild(dur);
    }

    // SA4E-369: per-tool-call copy — the button + click-time entry lookup
    // live in export-ui.js; this side passes the tool id + tab accessor.
    if (window.ChatExportUI) {
      window.ChatExportUI.attachToolCopyAction(
        header,
        tc.id,
        function () { return S.getTab(S.activeTabId); }
      );
    }

    // Click handler: toggle expand/collapse — R2 sticky marker + persistence.
    // Once the user toggles, auto rules never touch this block again.
    header.addEventListener("click", function () {
      var isExpanded = block.classList.toggle("expanded");
      block.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      // SA4E-372 R1: sticky DOM marker — updateToolCall's terminal fold checks
      // this attribute; markToolUserManaged persists userExpanded for replay.
      block.setAttribute("data-user-managed", "1");
      S.markToolUserManaged(tc.id, isExpanded);
    });

    // Keyboard handler: Enter/Space toggle (BR-17) — same sticky semantics.
    block.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        var isExpanded = block.classList.toggle("expanded");
        block.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        block.setAttribute("data-user-managed", "1"); // R1 sticky (same as click)
        S.markToolUserManaged(tc.id, isExpanded);
      }
    });

    // Body content — KSA-281: Two sections (Request + Response)
    var body = document.createElement("div");
    body.className = "tool-call-body";

    // --- REQUEST section (always show args) ---
    var reqSection = document.createElement("div");
    reqSection.className = "tool-section tool-section-request";
    var reqLabel = document.createElement("div");
    reqLabel.className = "tool-section-label";
    reqLabel.textContent = "Request";
    var reqContent = document.createElement("pre");
    reqContent.className = "tool-section-content";
    reqContent.textContent = tc.args && Object.keys(tc.args).length > 0
      ? JSON.stringify(tc.args, null, 2)
      : "(no parameters)";
    reqSection.appendChild(reqLabel);
    reqSection.appendChild(reqContent);

    // --- RESPONSE section ---
    var resSection = document.createElement("div");
    resSection.className = "tool-section tool-section-response";
    var resLabel = document.createElement("div");
    resLabel.className = "tool-section-label";
    resLabel.textContent = "Response";
    var resContent = document.createElement("pre");
    resContent.className = "tool-section-content";
    if (displayStatus === "completed" && tc.result) {
      resContent.textContent = tc.result;
    } else if (displayStatus === "failed" && tc.error) {
      resContent.textContent = tc.error;
      resSection.classList.add("failed");
    } else if (displayStatus === "interrupted") {
      resContent.textContent = "(interrupted)";
    } else {
      resContent.textContent = "(waiting...)";
    }
    resSection.appendChild(resLabel);
    resSection.appendChild(resContent);

    body.appendChild(reqSection);
    body.appendChild(resSection);

    block.appendChild(header);
    block.appendChild(body);

    // Tool approval UI — builder lives in chat-tool-helpers.js (SA4E-372);
    // no-op on replay (live consent renders only).
    if (requiresApproval) S.buildToolApprovalBar(tc, block, isReplay);

    // KSA-290: Append inside tool-container-body wrapper (not container root)
    // SA4E-371: flag the open response cycle — the next thinking/token delta
    // closes it (per-cycle groups follow the tool render).
    if (S.currentCycle) S.currentCycle.hasTools = true;

    var container = S.getOrCreateToolContainer();
    // SA4E-372 R1: legacy turns post tool events LIVE while the stream is
    // still buffered (replays only at turn end) — no cycle is open yet.
    // Track the orphan container; the first opened cycle adopts it (below).
    S.trackPreCycleContainer(container, isReplay);
    var bodyWrap = container.querySelector(".tool-container-body");
    bodyWrap.appendChild(block);
    S.toolCalls[tc.id] = block;
    S.updateToolContainerSummary(container);

    // R2: live tool blocks EXPAND by default the moment they render (the
    // user follows the call start); terminal auto-collapse comes in
    // chat-toolupdate. Replay blocks honor the persisted final state
    // (running/interrupted stay open; manual choices always stick).
    if (!isReplay) {
      block.classList.add("expanded");
      block.setAttribute("aria-expanded", "true");
    } else {
      var replayExpanded = tc.userManaged ? tc.userExpanded === true :
        (tc.status === "running" || tc.status === "interrupted");
      if (tc.userManaged) block.setAttribute("data-user-managed", "true");
      if (replayExpanded) {
        block.classList.add("expanded");
        block.setAttribute("aria-expanded", "true");
      }
    }

    // Force-expand container when approval is needed (override auto-collapse)
    if (requiresApproval && !isReplay) {
      container.classList.remove("tc-collapsed");
      var summaryHdr = container.querySelector(".tool-container-summary");
      if (summaryHdr) summaryHdr.setAttribute("aria-expanded", "true");
    }

    S.scrollToBottom();

    // KSA-240: Persist tool call into active tab so it survives re-renders/reload
    if (!isReplay) {
      var currentTab = S.getTab(S.activeTabId);
      if (currentTab) {
        if (!currentTab.messages) currentTab.messages = [];
        currentTab.messages.push({
          role: "tool",
          content: "",
          toolData: {
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: tc.status,
            result: tc.result,
            duration: tc.duration,
            timestamp: new Date().toISOString()
          }
        });
        S.saveStateToDisk();
      }
    }
  };
})();
