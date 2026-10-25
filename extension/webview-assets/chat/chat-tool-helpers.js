/**
 * Chat Panel — Tool Call Helpers (KSA-247)
 * Tool name categorization (icon/label/css), duration formatting,
 * status glyphs. Consumed by chat-toolcall.js / chat-toolupdate.js.
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  // Categorize a tool by name -> { icon, label, cssClass }
  // KSA-247: Enhanced with explicit prefixMap to fix OI-4 priority bug.
  // (">_" icons are written as \x26gt;_ escapes so the source survives
  // transport; runtime strings are identical to the original chat.js.)
  S.categorizeTool = function (name) {
    var n = (name || "").toLowerCase();

    // KSA-279: System/meta events (steering, hooks) - distinct category
    if (n.indexOf("steering") !== -1 || n.indexOf("_rules_") !== -1)
      return { icon: "S", label: "RULES", cls: "cat-rules" };
    if (n.indexOf("hook") !== -1)
      return { icon: "H", label: "HOOK", cls: "cat-hook" };

    // Priority 1: Explicit prefix matches (most specific first)
    var prefixMap = [
      // SA4E-369 UAT fix (UX): peer a2a tools get their OWN category — a
      // blocking peer_send involves ANOTHER tab's agent and must never
      // render like a local read/grep call.
      { prefix: "peer_",          icon: "\u21C4", label: "PEER",  cls: "cat-peer" },
      { prefix: "execute_pwsh",    icon: "\x26gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "control_pwsh",    icon: "\x26gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "get_process",     icon: "\x26gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "list_process",    icon: "\x26gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "grep_search",     icon: "?",  label: "SEARCH", cls: "cat-search" },
      { prefix: "file_search",     icon: "?",  label: "SEARCH", cls: "cat-search" },
      { prefix: "mem_search",      icon: "m",  label: "MEM",    cls: "cat-memory" },
      { prefix: "mem_ingest",      icon: "m",  label: "MEM",    cls: "cat-memory" },
      { prefix: "read_file",       icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "read_files",      icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "read_code",       icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "list_directory",  icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "fs_write",        icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "str_replace",     icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "stream_write",    icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "export_docx",     icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "embed_images",    icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "drawio",          icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "jira_",           icon: "J",  label: "JIRA",   cls: "cat-jira" }
    ];

    for (var i = 0; i < prefixMap.length; i++) {
      if (n.indexOf(prefixMap[i].prefix) === 0) {
        return { icon: prefixMap[i].icon, label: prefixMap[i].label, cls: prefixMap[i].cls };
      }
    }

    // Priority 2: Contains-based matching (broader patterns)
    if (n.indexOf("pwsh") !== -1 || n.indexOf("shell") !== -1 || n.indexOf("command") !== -1)
      return { icon: "\x26gt;_", label: "CMD", cls: "cat-command" };
    if (n.indexOf("search") !== -1 || n.indexOf("grep") !== -1 || n.indexOf("find") !== -1)
      return { icon: "?", label: "SEARCH", cls: "cat-search" };
    if (n.indexOf("mem_") !== -1 || n.indexOf("kb_") !== -1)
      return { icon: "m", label: "MEM", cls: "cat-memory" };
    if (n.indexOf("jira") !== -1 || n.indexOf("issue") !== -1)
      return { icon: "J", label: "JIRA", cls: "cat-jira" };
    if (n.indexOf("read") !== -1 || n.indexOf("write") !== -1 || n.indexOf("file") !== -1 ||
        n.indexOf("list") !== -1 || n.indexOf("directory") !== -1)
      return { icon: "[]", label: "FILE", cls: "cat-file" };
    if (n.indexOf("drawio") !== -1 || n.indexOf("export") !== -1 || n.indexOf("docx") !== -1)
      return { icon: "D", label: "DOC", cls: "cat-doc" };

    // Priority 3: Fallback
    return { icon: "T", label: "TOOL", cls: "cat-tool" };
  };

  // KSA-247: Format duration from ms to human-readable
  S.formatDuration = function (ms) {
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(1) + "s";
  };

  /**
   * SA4E-371 (R2): record a manual expand/collapse on a tool block — the
   * sticky flag lives in the persisted toolData (survives replay) while the
   * DOM marker (data-user-managed) stops every auto rule for this render.
   */
  S.markToolUserManaged = function (toolCallId, expanded) {
    var tab = S.getTab(S.activeTabId);
    if (!tab || !tab.messages) return;
    for (var i = tab.messages.length - 1; i >= 0; i--) {
      var m = tab.messages[i];
      if (m.role === "tool" && m.toolData && m.toolData.id === toolCallId) {
        m.toolData.userManaged = true;
        m.toolData.userExpanded = !!expanded;
        break;
      }
    }
    S.saveStateToDisk();
  };

  /**
   * SA4E-372: tool approval bar builder — extracted verbatim from
   * chat-toolcall.js (keeps the renderer under the 200-line gate).
   * Three buttons (Allow / Allow all <pattern> / Deny), each posts a
   * "chat:toolApproval" message then removes the bar; rememberPattern
   * derives "<first-token> *" from the command args. Appends the bar to
   * the block and auto-expands it so the user sees the consent prompt.
   * Called only for live renders needing consent — replay no-ops here.
   */
  S.buildToolApprovalBar = function (tc, block, isReplay) {
    if (!tc || isReplay) return;
    var vscode = S.vscode;
    var approvalBar = document.createElement("div");
    approvalBar.className = "tool-approval-bar";
    approvalBar.innerHTML =
      '<span class="tool-approval-label">⚠️ Requires approval</span>' +
      '<button class="tool-approve-btn">Allow</button>' +
      '<button class="tool-approve-pattern-btn">Allow all ' + S.escapeHtml(tc.name) + '</button>' +
      '<button class="tool-deny-btn">Deny</button>';
    approvalBar.querySelector(".tool-approve-btn").addEventListener("click", function () {
      vscode.postMessage({ type: "chat:toolApproval", toolId: tc.id, decision: "approve" });
      approvalBar.remove();
    });
    approvalBar.querySelector(".tool-approve-pattern-btn").addEventListener("click", function () {
      var cmd = (tc.args && tc.args.command) ? tc.args.command : "";
      var parts = cmd.trim().split(/\s+/);
      var pattern = parts.length > 1 ? parts[0] + " *" : cmd;
      vscode.postMessage({ type: "chat:toolApproval", toolId: tc.id, decision: "approve", rememberPattern: pattern });
      approvalBar.remove();
    });
    approvalBar.querySelector(".tool-deny-btn").addEventListener("click", function () {
      vscode.postMessage({ type: "chat:toolApproval", toolId: tc.id, decision: "reject" });
      approvalBar.remove();
    });
    block.appendChild(approvalBar);
    block.classList.add("expanded"); // Auto-expand so user sees approval
  };

  // === SA4E-372 R1 — orphan tool-container adoption (legacy turns) ===
  // Legacy turns post tool events LIVE while the stream is still buffered
  // (replays only at turn end) — no cycle is open yet, so hasTools can't
  // fire and the container lands at the transcript ROOT. The first cycle
  // that opens adopts the orphans → THINK(c1) → TOOLS → THINK(c2) order.

  /** Remember a live tool container rendered before any cycle opened. */
  S.trackPreCycleContainer = function (container, isReplay) {
    if (isReplay || S.currentCycle || !container) return;
    if (!S.preCycleContainers) S.preCycleContainers = [];
    if (S.preCycleContainers.indexOf(container) === -1) S.preCycleContainers.push(container);
  };

  /** Adopt tracked orphans into the cycle opening now: hasTools marker
   *  (next thinking delta closes the cycle) + chronological persist — the
   *  entry moves BEFORE the adopted tools' messages for correct replay. */
  S.adoptPreCycleContainers = function (c, tab) {
    if (!S.preCycleContainers || !S.preCycleContainers.length) return;
    c.hasTools = true;
    c.adoptedContainers = S.preCycleContainers.slice();
    S.preCycleContainers = [];
    if (!tab || !tab.messages) return;
    var firstToolAt = -1;
    for (var ai = 0; ai < c.adoptedContainers.length && firstToolAt < 0; ai++) {
      var blocks = c.adoptedContainers[ai].querySelectorAll(".tool-call-block");
      for (var bi = 0; bi < blocks.length && firstToolAt < 0; bi++) {
        var tid = (blocks[bi].id || "").slice(3); // "tc-<id>" → "<id>"
        for (var mi = 0; mi < tab.messages.length; mi++) {
          var mm = tab.messages[mi];
          if (mm.role === "tool" && mm.toolData && mm.toolData.id === tid) { firstToolAt = mi; break; }
        }
      }
    }
    if (firstToolAt < 0) return;
    var at = tab.messages.indexOf(c.entry);
    if (at > firstToolAt) {
      tab.messages.splice(at, 1);
      tab.messages.splice(firstToolAt, 0, c.entry);
    }
  };

  /** Close-time DOM move: adopted containers slot AFTER the cycle's
   *  rendered elements — THINK → [bubble] → TOOLS. If a work-trace is open
   *  (SA4E-381 Issue 3), containers go into the trace body instead of the
   *  transcript root (presentation-only grouping, order preserved).
   */
  S.placeAdoptedContainers = function (c) {
    if (!c.adoptedContainers || !c.adoptedContainers.length) return;
    var traceBody = S.activeTrace && S.activeTrace.querySelector(".trace-body");
    var targetParent = traceBody || messagesEl;
    var refEl = null;
    if (!traceBody) {
      refEl = c.bubbleEl && c.bubbleEl.parentNode === messagesEl ? c.bubbleEl
        : (c.thinkingEl && c.thinkingEl.parentNode === messagesEl ? c.thinkingEl : null);
    }
    for (var oi = 0; oi < c.adoptedContainers.length; oi++) {
      var oc = c.adoptedContainers[oi];
      if (!oc || !oc.parentNode) continue;
      if (refEl) {
        targetParent.insertBefore(oc, refEl.nextSibling);
        refEl = oc;
      } else {
        targetParent.appendChild(oc);
      }
    }
    c.adoptedContainers = [];
    if (S.updateTraceSummary) S.updateTraceSummary();
  };

  S.statusIcon = function (status) {
    if (status === "running") return "\u23F3";
    if (status === "completed") return "\u2713";
    if (status === "failed") return "\u2717";
    if (status === "interrupted") return "\u23F8";
    return "";
  };
})();
