/**
 * Chat Panel — Send + Working Status
 * sendMessage() pipeline (tab auto-rename, attachments, history tracking),
 * working bar state machine (setWorking/setGraphDone), statusLabel.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var inputEl = S.inputEl;
  var workingBar = S.workingBar;
  var workingText = S.workingText;
  var stopBtn = S.stopBtn;

  // KSA-240: prevents working re-activation after completion
  var graphDone = false;

  // === Send Message ===
  S.sendMessage = function () {
    var text = S.getInputText().trim();
    if (!text && S.pastedAttachments.length === 0) return;

    // Reset graph completion flag for new interaction
    graphDone = false;

    S.showMessages();

    // KSA-240: Auto-rename tab to first message excerpt — BEFORE appending the
    // user block (the rename check reads messages.length === 0).
    var currentTab = S.getTab(S.activeTabId);
    var isFirst = currentTab && text && (!currentTab.messages || currentTab.messages.length === 0);
    if (isFirst) {
      var excerpt = text.substring(0, 25).trim();
      if (text.length > 25) excerpt += "\u2026";
      currentTab.name = excerpt;
      S.renderTabBar();
      vscode.postMessage({ type: "tab:rename", payload: { tabId: S.activeTabId, newName: excerpt } });
    }

    // SA4E-391: append the user block via the flat renderer (single source —
    // appendBlock pushes to tab.messages AND renders). The images ride ON the
    // user entry so the bubble shows thumbnails (not a "[Image: name]" string).
    var imageAtts = [];
    for (var a = 0; a < S.pastedAttachments.length; a++) {
      if (S.pastedAttachments[a].type === "image" && S.pastedAttachments[a].dataUrl) {
        imageAtts.push({ name: S.pastedAttachments[a].name, dataUrl: S.pastedAttachments[a].dataUrl });
      }
    }
    if (text || imageAtts.length > 0) {
      S.appendBlock(S.activeTabId, {
        role: "user",
        content: text,
        images: imageAtts.length > 0 ? imageAtts : undefined,
        timestamp: new Date().toISOString(),
      });
    }
    S.setWorking(true);

    var attachments = S.pastedAttachments.map(function (att) {
      return { name: att.name, type: att.type === "image" ? "image/png" : "application/octet-stream", size: 0, uri: att.dataUrl || "" };
    });

    vscode.postMessage({
      type: "chat:userMessage",
      // SA4E-391 Issue 2 (stream routing): carry the REAL active tab id so the
      // host can stamp it as originTabId on every stream/tool event of this
      // turn. Without it the host used a placeholder ("default") that matched
      // no tab UUID, so routeStreamEvent dropped every chunk.
      tabId: S.activeTabId,
      text: text || "(attached files)",
      context: S.contextItems.length > 0 ? S.contextItems : undefined,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    inputEl.innerHTML = "";
    inputEl.style.height = "auto";
    S.clearContextChips();
    // Save to history for Up/Down navigation. SA4E-391: store an ENTRY that
    // carries the attached images too (previously only text was kept, so a
    // recalled message lost its image). Read `imageAtts` BEFORE we clear
    // pastedAttachments below.
    if (text || (imageAtts && imageAtts.length)) {
      S.messageHistory.push({ text: text || "", images: (imageAtts && imageAtts.length) ? imageAtts.slice() : undefined });
      if (S.messageHistory.length > 50) S.messageHistory.shift();
    }
    S.pastedAttachments = [];
    S.renderAttachments();
    S.historyIndex = -1;
    S.pendingInput = "";
  };

  // === Working Status ===
  S.setWorking = function (active, label) {
    if (active) {
      // Don't re-activate if graph already signaled final completion
      if (graphDone) return;
      workingBar.classList.add("active");
      workingText.textContent = label || "Working...";
      stopBtn.style.display = "inline-flex";
      S.isStreaming = true;
    // SA4E-381 Issue 3: reset turn-level counters
    S.turnStartTime = Date.now();
    S.turnThinkCount = 0;
    } else {
      workingBar.classList.remove("active");
      stopBtn.style.display = "none";
      S.isStreaming = false;
      // Fix J: no working bar = no approval prompt (timeout/auto-reject cleans up too).
      S.hideApprovalButtons();
    }
  };

  // Called only by chat:workingStatus message — marks graph as truly done
  S.setGraphDone = function () {
    graphDone = true;
    S.setWorking(false);
  };

  // Map a node status signal to a friendly working-bar label.
  S.statusLabel = function (nodeId, status) {
    var node = (nodeId || "agent").toString();
    var s = (status || "").toString();
    if (s === "active" || s === "") {
      return node === "chat" ? "Thinking..." : node.toUpperCase() + " working...";
    }
    return node.toUpperCase() + ": " + s;
  };
})();
