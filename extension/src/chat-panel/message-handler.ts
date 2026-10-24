/**
 * Message Handler --- KSA-210
 * Dispatches incoming webview messages to the appropriate engine actions.
 * Skill/workspace context resolution lives in ./message-handler/*.
 */

import { debugLog } from "../debug-logger";
import { PiWorkflowAdapter } from "../pi-workflow";
import { ChatWebviewToExtMessage, ChatExtToWebviewMessage, AutopilotMode } from "./message-protocol";
import { buildEnrichedText, routeUserMessage } from "./message-routing";
import { exportConversationToFile, copyMessageEntryToClipboard } from "./conversation-export-io";
import {
  autoResolveSkillContext,
  isPlainChat,
  resolveSkillContext,
  type SkillContextItem,
} from "./message-handler/skill-context";
import { resolveWorkspaceContext } from "./message-handler/workspace-context";
import { handlePeerTabClosed, registerPeerTabIdentity, renamePeerTabIdentity } from "../pi-workflow/peer/lifecycle";
import { wirePeerApprovalBridge, tryResolvePeerApproval } from "./peer-approval-bridge";
import { wirePeerInboundBridge } from "./peer-inbound-bridge";

export class MessageHandler {
  private currentModel: string = "auto";
  private currentMode: AutopilotMode = "autopilot";

  constructor(
    private readonly getEngine: () => PiWorkflowAdapter,
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void,
    private readonly workspaceRoot: string,
    private readonly onPickContext?: (contextType: string) => void,
    private readonly onPickAttachment?: () => void,
    private readonly onApplyCode?: (code: string, filePath?: string) => void,
    private readonly onInsertCode?: (code: string) => void,
    private readonly onSetModel?: (model: string) => void,
    private readonly onTurnComplete?: () => void,
    private readonly onReady?: () => void
  ) {
    // S-02(b): one bridge per handler — peer pending events reach the SAME chat:toolApprovalPending loop.
    wirePeerApprovalBridge(this.sendToWebview);
    // SA4E-369 AC4: receiving-tab visibility (badge + [Peer inbound] prefix + reply row).
    wirePeerInboundBridge(this.sendToWebview);
  }

  async handle(msg: ChatWebviewToExtMessage): Promise<void> {
    debugLog(` MessageHandler.handle: type="${msg.type}"`);
    switch (msg.type) {
      case "chat:chatHistory":
        await this.handleChatHistory();
        break;
      case "ready":
      case "refresh":
        await this.handleReady();
        break;
      case "chat:userMessage":
        await this.handleUserMessage((msg as any).text, (msg as any).context);
        break;
      case "chat:approvalAction":
        await this.handleApproval(msg.decision, msg.feedback);
        break;
      case "chat:cancelStream":
        this.getEngine().cancel();
        this.sendToWebview({ type: "chat:workingStatus", working: false });
        this.sendToWebview({ type: "chat:streamComplete", streamId: "cancelled", nodeId: "user", finalContent: "Cancelled by user", metadata: {} } as any);
        break;
      case "chat:resumePipeline":
        this.sendToWebview({ type: "chat:workingStatus", working: true, label: "Resuming..." });
        try {
          await this.getEngine().resume(msg.threadId);
        } finally {
          this.sendToWebview({ type: "chat:workingStatus", working: false });
        }
        break;
      case "chat:clearHistory": break;
      case "chat:startFresh": break;
      case "chat:graphNodeClick":
        this.handleNodeClick(msg.nodeId);
        break;
      case "chat:pickContext":
        if (this.onPickContext) { this.onPickContext(msg.contextType); }
        break;
      case "chat:pickAttachment":
        if (this.onPickAttachment) { this.onPickAttachment(); }
        break;
      case "chat:setModel":
        this.currentModel = msg.model;
        if (this.onSetModel) { this.onSetModel(msg.model); }
        break;
      case "chat:setMode":
        this.currentMode = msg.mode;
        // Fix J: forward to the approval gate so Autopilot auto-approves
        // non-destructive tools instead of hanging on an invisible prompt.
        this.getEngine().setAutopilotMode(msg.mode);
        break;
      case "chat:toolApproval":
        this.handleToolApproval((msg as any).toolId, (msg as any).decision, (msg as any).rememberPattern);
        break;
      case "chat:applyCode":
        if (this.onApplyCode) { this.onApplyCode(msg.code, msg.filePath); }
        break;
      case "chat:insertCode":
        if (this.onInsertCode) { this.onInsertCode(msg.code); }
        break;
      case "chat:selectAgent":
        this.handleSelectAgent((msg as any).agentId);
        break;
      case "tab:create":
        if (this.onTurnComplete) { this.onTurnComplete(); }
        break;
      case "tab:switch":
        this.getEngine().switchActiveTab((msg as any).payload.tabId);
        // S-01(1): register the peer identity — I-1; upgraded when the session host is created.
        registerPeerTabIdentity((msg as any).payload.tabId, this.workspaceRoot);
        if (this.onTurnComplete) { this.onTurnComplete(); }
        break;
      // S-01(2): I-8 single cleanup point (deregister + PEER_009 + threads + guards + evict).
      case "tab:close":
        handlePeerTabClosed((msg as any).payload?.tabId);
        break;
      // SA4E-369 round-5 UAT: the registry identity follows the display name
      // (agent-less tabs); agent-driven tabs keep the agent identity.
      case "tab:rename":
        renamePeerTabIdentity((msg as any).payload?.tabId, (msg as any).payload?.newName);
        break;
      // SA4E-369: export the conversation / copy a single message for
      // external AI analysis. IO failures surface as a chat:error (the
      // provider's handleMessage catch); save-dialog cancel is silent.
      case "chat:exportConversation":
        await exportConversationToFile({
          format: (msg as any).format === "json" ? "json" : "markdown",
          tab: (msg as any).tab,
          model: (msg as any).model || this.currentModel,
          mode: (msg as any).mode || this.currentMode,
        });
        break;
      case "chat:copyMessage":
        await copyMessageEntryToClipboard({ entry: (msg as any).entry });
        break;
    }
  }

  private async handleChatHistory(): Promise<void> {
    const engine = this.getEngine();
    // Access the store via the adapter's protected store property
    const store = (engine as any).store;
    if (!store) return;
    
    const history = store.getHistory ? store.getHistory() : [];
    
    this.sendToWebview({
      type: "chat:chatHistory",
      messages: history || [],
    } as any);
  }

  private async handleReady(): Promise<void> {
    this.onReady?.();
    const pipelines = await this.getEngine().listPersistedPipelines();
    // Only show resume prompt for SDLC pipelines that are actively paused (not completed/cancelled)
    const paused = pipelines.find(p => p.status === "paused" && p.ticketKey);
    if (paused) {
      this.sendToWebview({ type: "chat:resumePrompt", threadId: paused.threadId, ticketKey: paused.ticketKey, phase: paused.phase, pausedAt: paused.lastUpdatedAt });
    }
    const nodes = this.getEngine().getCurrentNodeStates();
    this.sendToWebview({ type: "chat:graphUpdate", nodes });
  }

  private async handleUserMessage(text: string, context?: Array<{ type: string; label: string; path?: string; content?: string }>): Promise<void> {
    const skillCtx: SkillContextItem[] = resolveSkillContext(this.workspaceRoot, text);
    const autoCtx = isPlainChat(text) ? autoResolveSkillContext(this.workspaceRoot, text) : [];
    const mergedSkills = [...skillCtx];
    for (const a of autoCtx) {
      if (!mergedSkills.some(e => e.label === a.label)) mergedSkills.push(a);
    }
    const mergedContext = context ? [...context, ...mergedSkills] : mergedSkills;
    let strippedText = text;
    for (const s of skillCtx) {
      strippedText = strippedText.replace(new RegExp("/skill:" + s.label + "\\b", "g"), "");
      strippedText = strippedText.replace(new RegExp("/" + s.label + "\\b", "g"), "");
    }
    strippedText = strippedText.replace(/\s{2,}/g, " ").trim();
    const finalText = strippedText.length > 0 ? strippedText : "Please follow the provided skill instructions.";
    const wsCtx = await resolveWorkspaceContext(finalText, mergedContext);
    const allContext = [...mergedContext, ...wsCtx];
    const enrichedText = buildEnrichedText(finalText, allContext);
    debugLog(` handleUserMessage: "${finalText.slice(0, 80)}" (context: ${allContext.length} items, explicitSkills: ${skillCtx.length}, autoSkills: ${autoCtx.length}, workspace: ${wsCtx.length})`);
    this.sendToWebview({ type: "chat:workingStatus", working: true, label: "Working..." });
    try {
      const engine = this.getEngine();
      await engine.hookEngine.firePromptSubmit(finalText, engine.getStreamHandler());
    } catch (hookErr) {
      // Hooks must never break main execution, but failures must be visible.
      debugLog(`[MessageHandler] promptSubmit hook error (non-fatal): ${(hookErr as Error).message}`);
    }
    await routeUserMessage(finalText, enrichedText, this.getEngine, this.sendToWebview, this.onTurnComplete);
  }

  private async handleApproval(decision: string, feedback?: string): Promise<void> {
    const validDecisions = ["approve", "reject", "revise"] as const;
    if (!validDecisions.includes(decision as any)) { return; }
    await this.getEngine().handleApproval(decision, feedback);
  }

  /** Handle tool-level approval from webview (ToolApprovalGate) */
  private handleToolApproval(toolId: string, decision: string, rememberPattern?: string): void {
    const normalizedDecision = decision === "approve" ? "approve" : "reject";
    // S-02(b): the PEER gate may own this toolId — resolve there FIRST; peer decisions never feed the auto-approve matcher (D6).\n    
    if (tryResolvePeerApproval(toolId, normalizedDecision)) {
      this.sendToWebview({
        type: "chat:workingStatus",
        working: true,
        label: normalizedDecision === "approve" ? "Approved — peer turn running..." : "Rejected — peer turn aborted...",
      });
      return;
    }
    const gate = this.getEngine().approvalGate;
    if (!gate) return;
    // Store pattern for future auto-approve (legacy engine gate path only)
    if (normalizedDecision === "approve" && rememberPattern) {
      this.getEngine().commandPatternMatcher.addPattern(rememberPattern);
    }
    gate.resolveApproval(toolId, normalizedDecision);
    // Fix J: drop the stale "Waiting approval" label — the turn resumes now.
    this.sendToWebview({
      type: "chat:workingStatus",
      working: true,
      label: normalizedDecision === "approve" ? "Approved — running tool..." : "Rejected — continuing...",
    });
  }

  private handleNodeClick(nodeId: string): void {
    const nodes = this.getEngine().getCurrentNodeStates();
    const node = nodes.find(n => n.id === nodeId);
    if (node) { this.sendToWebview({ type: "chat:nodeDetails", node, recentOutputs: [] }); }
  }

  /** SA4E-186: Route SELECT_AGENT to engine and confirm to webview with wiring result. */
  private async handleSelectAgent(agentId: string | null): Promise<void> {
    if (!agentId) { return; }
    const result = await this.getEngine().selectAgent(agentId);
    this.sendToWebview({
      type: 'chat:agentSwitched',
      agentId: result.agentId,
      agentName: result.agentName,
      success: result.success,
      tabId: result.tabId,
      sessionRole: result.sessionRole,
      sessionPhase: result.sessionPhase,
      error: result.error,
    } as any);
  }
}