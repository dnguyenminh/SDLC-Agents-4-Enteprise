/**
 * Chat Panel — Core (KSA-210 + KSA-240)
 * Shared namespace for all chat modules. The original chat.js was a single
 * IIFE; the 200-line file standard split it into cohesive modules that
 * communicate through window.ChatState (plain browser JS, no bundler).
 * The full load order is declared in ChatHtmlBuilder.ts.
 */
(function () {
  "use strict";

  var vscode = acquireVsCodeApi();
  window.__vscode = vscode;

  // === Shared namespace: state + DOM refs + utilities ===
  var S = (window.ChatState = {});
  S.vscode = vscode;

  // --- DOM References ---
  S.messagesEl = document.getElementById("chat-messages");
  S.inputEl = document.getElementById("chat-input");
  S.sendBtn = document.getElementById("send-btn");
  S.statusEl = document.getElementById("status-indicator");
  S.welcomeEl = document.getElementById("welcome-state");
  S.workingBar = document.getElementById("working-bar");
  S.workingText = document.getElementById("working-text");
  S.cancelBtn = document.getElementById("cancel-btn");
  S.followBtn = document.getElementById("follow-btn");
  S.approveBtn = document.getElementById("approve-btn");
  S.rejectBtn = document.getElementById("reject-btn");
  S.stopBtn = document.getElementById("stop-btn");
  S.ctxBtn = document.getElementById("ctx-btn");
  S.attachBtn = document.getElementById("attach-btn");
  S.modelBtn = document.getElementById("model-btn");
  S.modelLabel = document.getElementById("model-label");
  S.modelDropdown = document.getElementById("model-dropdown");
  S.contextMenu = document.getElementById("context-menu");
  S.autopilotToggle = document.getElementById("autopilot-toggle");
  S.inputChipsEl = document.getElementById("input-context-chips");
  S.tabBar = document.getElementById("tab-bar");
  S.tabAddBtn = document.getElementById("tab-add-btn");
  S.contextUsageIcon = document.getElementById("context-usage-icon");
  S.contextTooltip = document.getElementById("context-tooltip");
  S.contextFullWarning = document.getElementById("context-full-warning");
  S.fullNewTabLink = document.getElementById("full-new-tab");
  S.contextToast = document.getElementById("context-toast");
  S.toastText = document.getElementById("toast-text");
  S.toastDismiss = document.getElementById("toast-dismiss");
  S.inputAttachmentsEl = document.getElementById("input-attachments");
  S.inputWrapper = document.querySelector(".input-wrapper");
  S.steeringSection = document.getElementById("steering-section");
  S.steeringHeader = document.getElementById("steering-header");
  S.steeringList = document.getElementById("steering-list");
  S.steeringCount = document.getElementById("steering-count");
  S.slashPopup = document.getElementById("slash-popup");
  S.slashAgentsList = document.getElementById("slash-agents-list");
  S.slashSteeringList = document.getElementById("slash-steering-list");
  S.slashSkillsList = document.getElementById("slash-skills-list");

  // --- Shared mutable state (modules read/write through S) ---
  S.isStreaming = false;
  S.hasMessages = false;
  S.currentModel = "auto";
  S.currentMode = "autopilot";
  S.contextItems = [];
  S.toolCalls = {};
  S.messageHistory = [];
  S.historyIndex = -1;
  S.pendingInput = "";
  // Fix J: tool waiting for user consent (chat:toolApprovalPending) — Approve/Reject state.
  S.pendingApproval = null;

  // === Tab State (KSA-240) ===
  var defaultTabId = crypto.randomUUID();
  S.tabs = [{ id: defaultTabId, name: "Chat 1", messages: [], tokenCount: 0, maxTokens: 128000 }];
  S.activeTabId = defaultTabId;
  S.tabCounter = 1;
  S.MAX_TABS = 10;
  S.lastThreshold = "safe";

  // SA4E-381 Issue 2 (response routing): the tab a tab-scoped protocol
  // message belongs to. The host stamps originTabId at turn start on the
  // 5 tab-scoped types (streamChunk / streamComplete / toolCall /
  // toolCallUpdate / toolApprovalPending); messages without it belong to
  // the tab the user is viewing.
  S.getMessageTargetTabId = function (msg) {
    return (msg && msg.originTabId) ? msg.originTabId : S.activeTabId;
  };

  // Model selector state (populated from chat:models message)
  S.availableModels = [];
  S.supportsAuto = true;

  // Attachments state (paste + drag & drop)
  S.pastedAttachments = []; // { type, name, dataUrl }

  // Tool container state (KSA-247/KSA-290)
  S.activeToolContainer = null;

  // SA4E-371: response-cycle state — thinking+text+tools per model response
  // Cycle machinery (open/close/persist) lives in chat-cycle.js.
  S.currentCycle = null;
  S.cycleSeq = 0;

  // === Utilities ===
  // \x26 is "&" — written as an escape so the source survives transport
  // unchanged (named HTML entities in the original chat.js source).
  var messagesEl = S.messagesEl;
  S.escapeHtml = function (str) {
    return (str || "").replace(/&/g, "\x26amp;").replace(/</g, "\x26lt;").replace(/>/g, "\x26gt;");
  };

  S.scrollToBottom = function () {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };
})();
