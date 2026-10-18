/**
 * Chat Panel — Pipeline Messages
 * Pipeline status line, approval card (gate checkpoints), resume prompt,
 * error bubbles (persisted for exports), server status indicator.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var messagesEl = S.messagesEl;
  var statusEl = S.statusEl;

  // === Pipeline Status ===
  S.handlePipelineStatus = function (msg) {
    if (msg.status === "running") {
      S.setWorking(true, msg.ticketKey + " \u2014 " + msg.phase);
    } else if (msg.status === "completed" || msg.status === "cancelled" || msg.status === "failed") {
      S.setWorking(false);
    }
    var statusText = msg.ticketKey
      ? msg.ticketKey + " \u2014 " + msg.phase + " (" + msg.status + ")"
      : msg.status;
    S.appendMessage("system", statusText);
  };

  // === Approval Card ===
  S.renderApprovalCard = function (checkpoint) {
    S.showMessages();
    S.setWorking(false);
    var card = document.createElement("div");
    card.className = "approval-card";

    var title = document.createElement("h4");
    title.textContent = checkpoint.gateId + ": " + checkpoint.summary;
    card.appendChild(title);

    if (checkpoint.criteria && checkpoint.criteria.length > 0) {
      var ul = document.createElement("ul");
      for (var i = 0; i < checkpoint.criteria.length; i++) {
        var li = document.createElement("li");
        li.textContent = checkpoint.criteria[i];
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }

    var actions = document.createElement("div");
    actions.className = "actions";

    var approveBtn = document.createElement("button");
    approveBtn.className = "approve";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "approve" });
      card.remove();
      S.appendMessage("system", "Approved \u2014 continuing pipeline...");
      S.setWorking(true);
    });

    var reviseBtn = document.createElement("button");
    reviseBtn.className = "revise";
    reviseBtn.textContent = "Revise";
    reviseBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "revise" });
      card.remove();
      S.appendMessage("system", "Revision requested \u2014 re-running phase...");
      S.setWorking(true);
    });

    var rejectBtn = document.createElement("button");
    rejectBtn.className = "reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "reject" });
      card.remove();
      S.appendMessage("system", "Rejected \u2014 pipeline stopped.");
    });

    actions.appendChild(approveBtn);
    actions.appendChild(reviseBtn);
    actions.appendChild(rejectBtn);
    card.appendChild(actions);
    messagesEl.appendChild(card);
    S.scrollToBottom();
  };

  // === Resume Prompt ===
  S.renderResumePrompt = function (msg) {
    S.showMessages();
    var prompt = document.createElement("div");
    prompt.className = "resume-prompt";

    var p = document.createElement("p");
    p.textContent = "Pipeline paused: " + msg.ticketKey + " \u2014 " + msg.phase;
    prompt.appendChild(p);

    var resumeBtn = document.createElement("button");
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:resumePipeline", threadId: msg.threadId });
      prompt.remove();
      S.setWorking(true, "Resuming...");
    });

    var freshBtn = document.createElement("button");
    freshBtn.textContent = "Start Fresh";
    freshBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:startFresh" });
      prompt.remove();
    });

    prompt.appendChild(resumeBtn);
    prompt.appendChild(freshBtn);
    messagesEl.appendChild(prompt);
    S.scrollToBottom();
  };

  // === Error ===
  S.renderError = function (msg) {
    S.showMessages();
    // SA4E-371: a failed turn may end without streamComplete — seal any
    // dangling response cycle + container first so the transcript stays
    // chronological (assistant entry precedes the standalone error bubble).
    S.finalizeToolContainer();
    // SA4E-369: errors are diagnostic gold for external AI analysis —
    // persist them into the tab model (they previously vanished on reload)
    // and let the user copy them per-message.
    var entry = { role: "error", content: msg.message, timestamp: new Date().toISOString() };
    S.appendMessage("error", msg.message, undefined, entry);
    var currentTab = S.getTab(S.activeTabId);
    if (currentTab) {
      if (!currentTab.messages) currentTab.messages = [];
      currentTab.messages.push(entry);
      S.saveStateToDisk();
    }
  };

  // === Server Status ===
  S.updateServerStatus = function (status) {
    statusEl.textContent = status;
    statusEl.className = "status " + status;
  };
})();
