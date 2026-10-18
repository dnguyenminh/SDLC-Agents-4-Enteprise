/**
 * Chat Panel — Toolbar Bindings
 * Working-bar buttons (Cancel/Stop/Follow/Approve/Reject), context (#)
 * menu, attach button, export-menu hand-off to export-ui.js, autopilot
 * toggle, outside-click dropdown dismissal.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var cancelBtn = S.cancelBtn;
  var stopBtn = S.stopBtn;
  var followBtn = S.followBtn;
  var approveBtn = S.approveBtn;
  var rejectBtn = S.rejectBtn;
  var ctxBtn = S.ctxBtn;
  var attachBtn = S.attachBtn;
  var contextMenu = S.contextMenu;
  var modelDropdown = S.modelDropdown;
  var autopilotToggle = S.autopilotToggle;

  // === Cancel / Stop ===
  cancelBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:cancelStream" });
    S.setWorking(false);
  });

  stopBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:cancelStream" });
    S.setWorking(false);
  });

  followBtn.addEventListener("click", function () {
    S.scrollToBottom();
  });

  // === Fix J: tool approval (Approve / Reject on the working bar) ===
  S.hideApprovalButtons = function () {
    S.pendingApproval = null;
    approveBtn.style.display = "none";
    rejectBtn.style.display = "none";
  };

  S.respondApproval = function (decision) {
    if (!S.pendingApproval) return;
    vscode.postMessage({ type: "chat:toolApproval", toolId: S.pendingApproval.toolId, decision: decision });
    S.hideApprovalButtons();
  };

  approveBtn.addEventListener("click", function () {
    S.respondApproval("approve");
  });

  rejectBtn.addEventListener("click", function () {
    S.respondApproval("reject");
  });

  // === Context Menu (#) ===
  ctxBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    S.toggleContextMenu();
  });

  S.toggleContextMenu = function () {
    contextMenu.classList.toggle("hidden");
    modelDropdown.classList.add("hidden");
  };

  var ctxMenuBtns = contextMenu.querySelectorAll("button");
  for (var c = 0; c < ctxMenuBtns.length; c++) {
    ctxMenuBtns[c].addEventListener("click", function () {
      var ctxType = this.getAttribute("data-ctx");
      vscode.postMessage({ type: "chat:pickContext", contextType: ctxType });
      contextMenu.classList.add("hidden");
    });
  }

  // === Attachment Button ===
  attachBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:pickAttachment" });
  });

  // SA4E-369: export menu + per-message copy UI lives in export-ui.js
  // (window.ChatExportUI) — this side only hands over live state accessors.
  if (window.ChatExportUI) {
    window.ChatExportUI.bindExportMenu(
      function () { return S.getTab(S.activeTabId); },
      function () { return S.currentModel; },
      function () { return S.currentMode; }
    );
  }

  // === Autopilot Toggle ===
  autopilotToggle.addEventListener("click", function () {
    var isOn = autopilotToggle.classList.contains("on");
    autopilotToggle.classList.toggle("on", !isOn);
    S.currentMode = isOn ? "supervised" : "autopilot";
    vscode.postMessage({ type: "chat:setMode", mode: S.currentMode });
  });

  // === Close dropdowns on outside click ===
  document.addEventListener("click", function () {
    modelDropdown.classList.add("hidden");
    contextMenu.classList.add("hidden");
  });
})();
