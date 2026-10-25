/**
 * Chat Panel — Message Handler from Extension
 * Single window "message" listener dispatching every chat:* / tab:*
 * / serverStatus message to the module functions on window.ChatState.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var autopilotToggle = S.autopilotToggle;
  var approveBtn = S.approveBtn;
  var rejectBtn = S.rejectBtn;

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "chat:streamChunk":
      case "chat:streamComplete":
      case "chat:toolCall":
      case "chat:toolCallUpdate":
        // SA4E-381 Issue 2+3: single choke point — active tab renders live;
        // background tab buffers model + pill counters (zero DOM to viewed tab).
        S.routeStreamEvent(msg);
        break;
      case "chat:graphUpdate":
        break;
      case "chat:approvalRequest":
        S.renderApprovalCard(msg.checkpoint);
        break;
      case "chat:chatHistory":
        S.renderChatHistory(msg.messages);
        break;
      case "chat:pipelineStatus":
        S.handlePipelineStatus(msg);
        break;
      case "chat:resumePrompt":
        S.renderResumePrompt(msg);
        break;
      case "chat:error":
        S.renderError(msg);
        S.setWorking(false);
        break;
      case "chat:peerInbound":
        // SA4E-369 AC4: a peer task arrived in tab msg.tabId — badge + prefix row.
        try { S.handlePeerInbound(msg); } catch (e) {
          vscode.postMessage({ type: "chat:debugLog", text: "handlePeerInbound ERROR: " + e.message });
        }
        break;
      case "chat:peerTurnSettled":
        // SA4E-369 AC4: the receiving tab's auto-run turn settled — reply row.
        try { S.handlePeerTurnSettled(msg); } catch (e) {
          vscode.postMessage({ type: "chat:debugLog", text: "handlePeerTurnSettled ERROR: " + e.message });
        }
        break;
      case "chat:contextPicked":
        S.addContextChip(msg.item);
        S.addFileReference(msg.item);
        break;
      case "chat:configUpdate":
        S.setModel(msg.model);
        if (msg.mode) {
          S.currentMode = msg.mode;
          autopilotToggle.classList.toggle("on", msg.mode === "autopilot");
        }
        break;
      case "chat:models":
        S.availableModels = Array.isArray(msg.models) ? msg.models : [];
        S.supportsAuto = msg.supportsAuto !== false;
        S.renderModelDropdown();
        if (msg.selected) {
          S.setModel(msg.selected);
        } else if (S.supportsAuto) {
          S.setModel("auto");
        } else if (S.availableModels.length > 0) {
          S.setModel(S.availableModels[0].id);
        }
        break;
      case "chat:workingStatus":
        if (msg.working) {
          S.setWorking(true, msg.label);
        } else {
          S.setGraphDone();
        }
        break;
      case "chat:toolApprovalPending":
        // SA4E-381 routing: the approval bar is the VIEWED tab's chrome —
        // a background tab's gated tool must not hijack it.
        if (S.getMessageTargetTabId(msg) === S.activeTabId) {
          // Fix J: a tool is blocked on consent — show Approve/Reject on the bar.
          S.pendingApproval = { toolId: msg.toolId, toolName: msg.toolName };
          S.setWorking(true, "Waiting approval: " + msg.toolName);
          approveBtn.style.display = "inline-flex";
          rejectBtn.style.display = "inline-flex";
        }
        break;
      case "chat:nodeDetails":
        break;
      case "serverStatus":
        S.updateServerStatus(msg.status);
        break;
      case "tab:updated":
        S.handleTabsUpdated(msg.payload);
        break;
      case "tab:contextUpdate":
        console.log("[chat.js] tab:contextUpdate received:", JSON.stringify(msg.payload));
        S.handleContextUpdate(msg.payload);
        break;
      case "chat:steeringLoaded":
        S.renderSteeringRules(msg.rules);
        break;
      case "chat:agentsLoaded":
        S.populateSlashAgents(msg.agents);
        break;
      case "chat:skillsLoaded":
        S.populateSlashSkills(msg.skills);
        break;
      case "chat:hookTriggered":
        S.renderHookBadge(msg.hook);
        break;
    }
  });
})();
