/**
 * Export UI — SA4E-369
 * Webview-side logic for "export conversation for AI analysis" + per-message
 * copy. Split from chat.js (200-line file standard); chat.js calls into
 * window.ChatExportUI and owns the tab DATA — this file owns the export UI.
 *
 * Loads BEFORE chat.js; the vscode API is acquired once by chat.js and
 * exposed as window.__vscode (acquireVsCodeApi() may only be called once
 * per webview), so every post goes through the lazy lookup below.
 */
(function () {
  "use strict";

  function post(msg) {
    var api = window.__vscode;
    if (api) api.postMessage(msg);
  }

  /**
   * Post the ACTIVE tab's full model (user/assistant/error messages + every
   * tool call with args/results) to the host, which renders it and writes a
   * .md/.json file via the save dialog. Model/mode are included so the
   * exported transcript is self-describing for external AI analysis.
   */
  /**
   * Strip non-serializable fields from a message entry before postMessage.
   * The flat renderer stores a live DOM reference on `entry._el`; structured
   * clone (used by postMessage) throws DataCloneError on DOM nodes, which
   * silently dropped the whole export message — so export "did nothing".
   * We also carry the thinking block's `text` so reasoning is not lost.
   */
  function serializeEntry(m) {
    if (!m || typeof m !== "object") return m;
    var out = {
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      nodeId: m.nodeId
    };
    // SA4E-391 multimodal: carry attached images (base64 data URLs) so the
    // exported transcript includes the picture, not just the prompt text.
    if (m.images && m.images.length) {
      out.images = m.images.map(function (im) {
        return { name: im.name, dataUrl: im.dataUrl || im.uri };
      });
    }
    if (m.role === "thinking") {
      // The exporter's assistant branch renders `thinking` in a fenced block
      // AND `content` as the reply body. A thinking entry has NO reply body —
      // set only `thinking` and keep `content` empty, otherwise the reasoning
      // is printed twice (once fenced, once as plain text). Normalize the text
      // the same way the UI does so the export has no giant blank-line gaps.
      // NOTE: this file is its own IIFE — it has NO `S` alias (that's
      // window.ChatState, set in chat-core.js). Use the global directly;
      // referencing a bare `S` here throws "S is not defined" and kills export.
      var CS = window.ChatState;
      out.thinking = (CS && CS.normalizeThinking) ? CS.normalizeThinking(m.text) : m.text;
      out.content = "";
    }
    if (m.role === "tool" && m.toolData) {
      out.toolData = {
        id: m.toolData.id, name: m.toolData.name, args: m.toolData.args,
        status: m.toolData.status, result: m.toolData.result,
        error: m.toolData.error, duration: m.toolData.duration,
        timestamp: m.toolData.timestamp
      };
    }
    return out;
  }

  function requestExport(format, tab, model, mode) {
    if (!tab) return;
    var messages = (tab.messages || []).map(serializeEntry);
    post({
      type: "chat:exportConversation",
      format: format === "json" ? "json" : "markdown",
      tab: { id: tab.id, name: tab.name, messages: messages },
      model: model,
      mode: mode
    });
  }

  /**
   * Attach a hover "copy as Markdown" button to a rendered message bubble.
   * `entry` is the LIVE model object reference — postMessage clones it at
   * click time, so the copy always matches the persisted state.
   */
  function attachCopyAction(el, entry) {
    if (!el || !entry) return;
    var btn = document.createElement("button");
    btn.className = "msg-copy-btn";
    btn.type = "button";
    btn.title = "Copy this message as Markdown (for AI analysis)";
    btn.setAttribute("aria-label", "Copy this message as Markdown");
    btn.textContent = "\u29C9";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      post({ type: "chat:copyMessage", entry: serializeEntry(entry) });
    });
    el.appendChild(btn);
  }

  /**
   * Attach a copy button to a tool block header. The entry is looked up at
   * CLICK time (fresh status/result/duration), not at render time.
   * `getTab` returns the active tab so the lookup always follows tab switches.
   */
  function attachToolCopyAction(header, toolCallId, getTab) {
    if (!header || !toolCallId) return;
    var btn = document.createElement("button");
    btn.className = "tool-copy-btn";
    btn.type = "button";
    btn.title = "Copy this tool call as Markdown (for AI analysis)";
    btn.setAttribute("aria-label", "Copy this tool call as Markdown");
    btn.textContent = "\u29C9";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var tab = getTab ? getTab() : null;
      var entry = null;
      if (tab && tab.messages) {
        for (var i = tab.messages.length - 1; i >= 0; i--) {
          var m = tab.messages[i];
          if (m.role === "tool" && m.toolData && m.toolData.id === toolCallId) {
            entry = m;
            break;
          }
        }
      }
      if (entry) post({ type: "chat:copyMessage", entry: serializeEntry(entry) });
    });
    header.appendChild(btn);
  }

  /**
   * Wire the toolbar export button + format menu. Closes on any document
   * click (own listener — the menu belongs to this module).
   * `getTab`/`getModel`/`getMode` are live accessors into chat.js state.
   */
  function bindExportMenu(getTab, getModel, getMode) {
    var exportBtn = document.getElementById("export-btn");
    var exportMenu = document.getElementById("export-menu");
    var contextMenu = document.getElementById("context-menu");
    var modelDropdown = document.getElementById("model-dropdown");
    if (!exportBtn || !exportMenu) return;

    exportBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      exportMenu.classList.toggle("hidden");
      if (contextMenu) contextMenu.classList.add("hidden");
      if (modelDropdown) modelDropdown.classList.add("hidden");
    });

    exportMenu.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-format]") : null;
      if (!btn) return;
      e.stopPropagation();
      requestExport(btn.getAttribute("data-format"), getTab(), getModel(), getMode());
      exportMenu.classList.add("hidden");
    });

    document.addEventListener("click", function () {
      exportMenu.classList.add("hidden");
    });
  }

  window.ChatExportUI = {
    bindExportMenu: bindExportMenu,
    requestExport: requestExport,
    attachCopyAction: attachCopyAction,
    attachToolCopyAction: attachToolCopyAction
  };
})();
