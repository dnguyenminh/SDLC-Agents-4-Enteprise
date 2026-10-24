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
    S.finalizeToolContainer(); // Seal previous turn's tools before user message
    // SA4E-369: the persisted entry is created up-front so the rendered
    // bubble carries it (per-message copy) AND the model stores ONE object.
    var userEntry = text
      ? { role: "user", content: text, timestamp: new Date().toISOString() }
      : null;
    if (userEntry) S.appendMessage("user", text, undefined, userEntry);
    if (S.pastedAttachments.length > 0) {
      for (var a = 0; a < S.pastedAttachments.length; a++) {
        if (S.pastedAttachments[a].type === "image") {
          S.appendMessage("user", "[Image: " + S.pastedAttachments[a].name + "]");
        }
      }
    }
    S.setWorking(true);

    // KSA-240: Auto-rename tab to first message excerpt
    var currentTab = S.getTab(S.activeTabId);
    if (currentTab && text && (!currentTab.messages || currentTab.messages.length === 0)) {
      var excerpt = text.substring(0, 25).trim();
      if (text.length > 25) excerpt += "\u2026";
      currentTab.name = excerpt;
      S.renderTabBar();
      vscode.postMessage({ type: "tab:rename", payload: { tabId: S.activeTabId, newName: excerpt } });
    }
    // Track message in local tab state
    if (currentTab && userEntry) {
      if (!currentTab.messages) currentTab.messages = [];
      currentTab.messages.push(userEntry);
    }
    S.saveStateToDisk();

    var attachments = S.pastedAttachments.map(function (att) {
      return { name: att.name, type: att.type === "image" ? "image/png" : "application/octet-stream", size: 0, uri: att.dataUrl || "" };
    });

    vscode.postMessage({
      type: "chat:userMessage",
      text: text || "(attached files)",
      context: S.contextItems.length > 0 ? S.contextItems : undefined,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    inputEl.innerHTML = "";
    inputEl.style.height = "auto";
    S.clearContextChips();
    S.pastedAttachments = [];
    S.renderAttachments();
    // Save to history for Up/Down navigation
    if (text) {
      S.messageHistory.push(text);
      if (S.messageHistory.length > 50) S.messageHistory.shift();
    }
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
