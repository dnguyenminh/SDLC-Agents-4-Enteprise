/**
 * Chat Panel — OpenCode-style tool / shell / edit blocks (SA4E-391).
 * A tool call renders as one line: "> name [k=v, ...]" while running, settling
 * to "✓ name" (done) or "✗ name" (failed). Shell tools render a "$ cmd" block;
 * file-edit tools render a "← Edit <path>" block with a +/- coloured diff when
 * old/new text is available, otherwise the written content.
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  var SHELL_TOOLS = ["execute", "bash", "shell", "execute_shell", "run", "executepwsh", "execute_pwsh"];
  var EDIT_TOOLS = ["edit", "write", "fs_write", "str_replace", "fswrite", "strreplace", "apply_diff", "applydiff", "create_file"];

  function baseName(name) { return (name || "").toLowerCase().replace(/[^a-z_]/g, ""); }
  function isShell(name) { return SHELL_TOOLS.indexOf(baseName(name)) !== -1; }
  function isEdit(name) { return EDIT_TOOLS.indexOf(baseName(name)) !== -1; }

  /** Short inline params: "[query=jira, threshold=0.1]" (skips long/complex). */
  function inlineParams(args) {
    if (!args || typeof args !== "object") return "";
    var parts = [];
    var keys = Object.keys(args);
    for (var i = 0; i < keys.length && parts.length < 4; i++) {
      var k = keys[i];
      var v = args[k];
      if (v == null) continue;
      if (typeof v === "object") continue; // skip nested (shown in edit/shell body)
      var s = String(v);
      if (s.length > 40) s = s.slice(0, 40) + "…";
      parts.push(k + "=" + s);
    }
    return parts.length ? " [" + parts.join(", ") + "]" : "";
  }

  function marker(status) {
    if (status === "completed") return "✓";
    if (status === "failed") return "✗";
    if (status === "interrupted") return "⊘";
    return "›"; // running / unknown
  }

  /** Extract the command string from a shell tool's args. */
  function shellCmd(args) {
    if (!args) return "";
    return String(args.command || args.cmd || args.script || args.input || "");
  }

  /** Extract { path, oldText, newText, content } from an edit tool's args. */
  function editParts(args) {
    if (!args) return {};
    return {
      path: args.path || args.file_path || args.filePath || args.targetFile || args.target_file || "",
      oldText: args.oldStr || args.old_str || args.oldText || args.search || "",
      newText: args.newStr || args.new_str || args.newText || args.replace || "",
      content: args.text || args.content || args.newStr || args.new_str || "",
    };
  }

  /** Render a +/- coloured diff (old red, new green). */
  function renderDiff(parent, oldText, newText) {
    var pre = document.createElement("pre");
    pre.className = "oc-diff";
    var oldLines = String(oldText).split("\n");
    var newLines = String(newText).split("\n");
    for (var i = 0; i < oldLines.length; i++) {
      var r = document.createElement("div");
      r.className = "oc-diff-del";
      r.textContent = "- " + oldLines[i];
      pre.appendChild(r);
    }
    for (var j = 0; j < newLines.length; j++) {
      var a = document.createElement("div");
      a.className = "oc-diff-add";
      a.textContent = "+ " + newLines[j];
      pre.appendChild(a);
    }
    parent.appendChild(pre);
  }

  /** Build a tool/shell/edit block element. */
  S.buildToolBlock = function (tc, isReplay) {
    var status = tc.status === "running" && isReplay ? "interrupted" : (tc.status || "running");

    if (isShell(tc.name)) {
      var sh = document.createElement("div");
      sh.className = "oc-shell";
      sh.id = "tc-" + tc.id;
      var cmd = document.createElement("div");
      cmd.className = "oc-shell-cmd";
      cmd.innerHTML = '<span class="oc-shell-prompt">$</span>' + S.escapeHtml(shellCmd(tc.args));
      sh.appendChild(cmd);
      if (status !== "running" && (tc.result || tc.error)) {
        var out = document.createElement("div");
        out.className = "oc-shell-out" + (status === "failed" ? " failed" : "");
        out.textContent = tc.error || tc.result || "";
        sh.appendChild(out);
      }
      return sh;
    }

    if (isEdit(tc.name)) {
      var ep = editParts(tc.args);
      var ed = document.createElement("div");
      ed.className = "oc-edit";
      ed.id = "tc-" + tc.id;
      var head = document.createElement("div");
      head.className = "oc-edit-head";
      head.innerHTML = '<span class="oc-edit-arrow">←</span> Edit ' + S.escapeHtml(ep.path || "(file)");
      ed.appendChild(head);
      if (ep.oldText && ep.newText) {
        renderDiff(ed, ep.oldText, ep.newText);
      } else if (ep.content) {
        var pre = document.createElement("pre");
        pre.className = "oc-edit-content";
        pre.textContent = ep.content;
        ed.appendChild(pre);
      }
      return ed;
    }

    // Generic tool call: one clickable line "> name [params]" + marker, with a
    // collapsible result/error body (click to expand). The body only exists
    // once the tool settled with a result or error.
    var el = document.createElement("div");
    el.className = "oc-tool status-" + status;
    el.id = "tc-" + tc.id;

    var resultText = tc.error || tc.result || "";
    var hasBody = status !== "running" && resultText !== "";

    var line = document.createElement("div");
    line.className = "oc-tool-line" + (hasBody ? " expandable" : "");
    line.innerHTML = '<span class="oc-tool-mark">' + marker(status) + '</span>' +
      '<span class="oc-tool-name">' + S.escapeHtml(tc.name) + '</span>' +
      '<span class="oc-tool-params">' + S.escapeHtml(inlineParams(tc.args)) + '</span>' +
      (hasBody ? '<span class="oc-tool-chevron">▸</span>' : '');
    el.appendChild(line);

    if (hasBody) {
      var body = document.createElement("pre");
      body.className = "oc-tool-body hidden" + (status === "failed" ? " failed" : "");
      body.textContent = resultText;
      el.appendChild(body);
      // Toggle expand on the tool line (chevron ▸ collapsed / ▾ expanded).
      line.addEventListener("click", function () {
        var open = body.classList.toggle("hidden") === false;
        var chev = line.querySelector(".oc-tool-chevron");
        if (chev) chev.textContent = open ? "▾" : "▸";
      });
    }
    return el;
  };

  /** Live update of a rendered tool block's status/result. */
  S.updateToolCall = function (msg, targetTabId) {
    targetTabId = targetTabId || S.activeTabId;
    var tab = S.getTab(targetTabId);
    // Sync persisted model (always — background tabs replay from this).
    if (tab && tab.messages) {
      for (var i = tab.messages.length - 1; i >= 0; i--) {
        var m = tab.messages[i];
        if (m.role === "tool" && m.toolData && m.toolData.id === msg.id) {
          m.toolData.status = msg.status;
          if (msg.result) m.toolData.result = msg.result;
          if (msg.error) m.toolData.error = msg.error;
          if (msg.duration) m.toolData.duration = msg.duration;
          // Re-render this block in place if it is visible.
          if (targetTabId === S.activeTabId && m._el && m._el.parentNode) {
            var fresh = S.buildToolBlock(m.toolData, false);
            m._el.parentNode.replaceChild(fresh, m._el);
            m._el = fresh;
          }
          break;
        }
      }
      S.saveStateToDisk();
    }
  };

  /** Render a live tool call (host chat:toolCall) into the active tab. */
  S.renderToolCall = function (tc, isReplay, _requiresApproval, targetTabId) {
    if (!tc || !tc.id || !tc.name) return;
    targetTabId = targetTabId || S.activeTabId;
    var entry = {
      role: "tool",
      toolData: {
        id: tc.id, name: tc.name, args: tc.args,
        status: tc.status, result: tc.result, error: tc.error, duration: tc.duration,
        timestamp: new Date().toISOString(),
      },
    };
    S.appendBlock(targetTabId, entry);
  };
})();
