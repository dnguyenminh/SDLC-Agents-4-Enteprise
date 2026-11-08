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
import { handlePeerTabClosed, registerPeerTabIdentity, renamePeerTabIdentity, updatePeerTabModel } from "../pi-workflow/peer/lifecycle";
import { modelSupportsVision } from "../pi-workflow/peer/model-capabilities";
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
        await this.handleUserMessage((msg as any).text, (msg as any).context, (msg as any).attachments);
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
        // SA4E-391: ONLY an EXPLICIT user pick rewrites the tab's peer-registry
        // model + capabilities. A passive tab-switch (explicit:false) sets the
        // engine model only — it must NOT clobber another tab's picked model
        // (a switch sending "auto" was wiping a tab's vision capability).
        if ((msg as { explicit?: boolean }).explicit === true) {
          try {
            const activeTabId = this.getEngine().getActiveTabId();
            if (activeTabId) updatePeerTabModel(activeTabId, msg.model);
          } catch { /* non-fatal — registry update must not break model pick */ }
        }
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
      case "tab:create": {
        // SA4E-369: register the newly OPENED tab as a peer right away so it is
        // visible to peer_list from other tabs — previously a tab was only
        // registered on switch / turn / save-state, so a just-opened tab was
        // invisible to delegation. Name is upgraded later by host creation.
        const createTabId = (msg as any).payload?.tabId;
        registerPeerTabIdentity(createTabId, this.workspaceRoot, (msg as any).payload?.name);
        // SA4E-391: a new tab inherits the current tab's model — set its peer
        // capability (e.g. vision) from that model right away.
        const inheritedModel = (msg as any).payload?.model;
        if (createTabId && inheritedModel) {
          try { updatePeerTabModel(createTabId, inheritedModel); } catch { /* non-fatal */ }
        }
        if (this.onTurnComplete) { this.onTurnComplete(); }
        break;
      }
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

  /**
   * SA4E-391 multimodal: convert webview image attachments (base64 `data:` URLs
   * in `uri`) into the pi harness TurnImage shape ({ data, mimeType }) — the
   * base64 payload WITHOUT the `data:<mime>;base64,` prefix. Non-image or
   * path-only attachments (no data URL) are skipped.
   */
  private toTurnImages(
    attachments?: Array<{ name?: string; type?: string; uri?: string }>,
  ): Array<{ data: string; mimeType: string }> | undefined {
    if (!attachments || attachments.length === 0) return undefined;
    const images: Array<{ data: string; mimeType: string }> = [];
    for (const att of attachments) {
      const uri = att?.uri || "";
      const m = /^data:([^;]+);base64,(.*)$/i.exec(uri);
      if (!m) continue; // only inline base64 data URLs carry pixels
      const mimeType = m[1] || att?.type || "image/png";
      if (!mimeType.startsWith("image/")) continue;
      images.push({ data: m[2], mimeType });
    }
    return images.length > 0 ? images : undefined;
  }

  /**
   * SA4E-391: build the prompt for a non-vision tab that received image(s).
   * Tells the agent it cannot read the images itself and must delegate to a
   * vision-capable peer. The images ride peer_send automatically (handled in
   * the peer tool), so the agent only needs to pick the right peer + message.
   */
  private buildVisionDelegationPrompt(userText: string, imageCount: number): string {
    const n = imageCount === 1 ? "an image" : `${imageCount} images`;
    return [
      `[SYSTEM NOTE] The user attached ${n} to this message, but YOUR model is`,
      `text-only and cannot read images. To help, you MUST delegate:`,
      `1. Call peer_list and find a peer whose \`capabilities\` include "vision".`,
      `2. Call peer_send to that peer with a clear instruction (e.g. "describe/read`,
      `   the attached image and report back"). The attached image(s) are forwarded`,
      `   to that peer automatically — you do NOT pass image data yourself.`,
      `3. Relay the peer's reply back to the user.`,
      `If NO peer has the "vision" capability, tell the user to open a tab with a`,
      `vision model (e.g. qwen-vl) and retry — do not guess the image contents.`,
      ``,
      `--- user message ---`,
      userText,
    ].join("\n");
  }

  private async handleUserMessage(
    text: string,
    context?: Array<{ type: string; label: string; path?: string; content?: string }>,
    attachments?: Array<{ name?: string; type?: string; uri?: string }>,
  ): Promise<void> {
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
    const images = this.toTurnImages(attachments);
    let promptText = enrichedText;
    // SA4E-391: if the user attached image(s) but THIS tab's model has no
    // vision, the model cannot read them. Instruct the agent to delegate to a
    // vision-capable peer via peer_list + peer_send. CRITICAL: the images MUST
    // still flow to the engine so peer_send can forward them to the peer — we
    // only tell the turn NOT to feed them to THIS blind model's own prompt
    // (via `imagesForDelegationOnly`). Previously we dropped the images here,
    // so peer_send found none and the peer received a task with NO image.
    const model = (this.currentModel || "").trim();
    // Only delegate when we KNOW the model (concrete id, not "auto"/empty) and
    // it is non-vision. For "auto"/unknown we optimistically send the image —
    // the resolved model may well be vision-capable (cloud gateways).
    const knownNonVision = model !== "" && model !== "auto" && !modelSupportsVision(model);
    let delegationOnly = false;
    if (images && images.length > 0 && knownNonVision) {
      promptText = this.buildVisionDelegationPrompt(enrichedText, images.length);
      delegationOnly = true; // carry images for peer_send, but not to this model
    }
    await routeUserMessage(finalText, promptText, this.getEngine, this.sendToWebview, this.onTurnComplete, images, delegationOnly);
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