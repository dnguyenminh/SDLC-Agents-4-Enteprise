/**
 * Message Handler --- KSA-210
 * Dispatches incoming webview messages to the appropriate engine actions.
 */

import * as vscode from "vscode";
import { debugLog } from "../debug-logger";
import { PiWorkflowAdapter } from "../pi-workflow";
import { ChatWebviewToExtMessage, ChatExtToWebviewMessage, AutopilotMode } from "./message-protocol";
import { buildEnrichedText, routeUserMessage } from "./message-routing";

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
  ) {}

  async handle(msg: ChatWebviewToExtMessage): Promise<void> {
    debugLog(` MessageHandler.handle: type="${msg.type}"`);
    switch (msg.type) {
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
      case "chat:openWorkflowGraph":
        vscode.commands.executeCommand("kiroSdlc.openWorkflowGraph");
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
        if (this.onTurnComplete) { this.onTurnComplete(); }
        break;
      case "tab:close": break;
      case "tab:rename": break;
    }
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

  private resolveSkillContext(text: string): Array<{ type: string; label: string; content: string }> {
    const fs = require("fs");
    const path = require("path");
    const skillDir = path.join(this.workspaceRoot, ".code-intel", "skills");
    const result: Array<{ type: string; label: string; content: string }> = [];
    if (!fs.existsSync(skillDir)) return result;
    let entries: any[];
    try { entries = fs.readdirSync(skillDir, { withFileTypes: true }); } catch { return result; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const skillFile = path.join(skillDir, id, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("/skill:" + escaped + "\\b|/" + escaped + "\\b", "g");
      if (re.test(text)) {
        try {
          result.push({ type: "skill", label: id, content: fs.readFileSync(skillFile, "utf-8") });
        } catch (e) { /* skill file unreadable — skip */ }
      }
    }
    return result;
  }

  private isPlainChat(text: string): boolean {
    const t = text.trim();
    if (/^[A-Z]+-\d+\s+/i.test(t)) return false;
    if (/^\/[a-z][-a-z]*\s+/i.test(t)) return false;
    const lc = t.toLowerCase();
    if (lc === "status" || lc === "resume" || lc === "cancel") return false;
    return true;
  }

  private autoResolveSkillContext(text: string): Array<{ type: string; label: string; content: string }> {
    const fs = require("fs");
    const path = require("path");
    const skillDir = path.join(this.workspaceRoot, ".code-intel", "skills");
    if (!fs.existsSync(skillDir)) return [];
    let entries: any[];
    try { entries = fs.readdirSync(skillDir, { withFileTypes: true }); } catch { return []; }
    const lower = text.toLowerCase();
    const STOP = new Set(["the", "and", "for", "with", "when", "use", "this", "that", "from", "your", "agent", "will", "into", "have", "are", "you", "our", "via", "how", "what", "which", "each", "other", "based", "such", "than", "then", "them", "they", "their", "about", "these", "those", "should", "must", "can", "may", "not", "but", "all", "any", "per", "within", "across", "between", "during", "using", "used", "also", "more", "most", "some", "only", "over", "under", "after", "before"]);
    const scored: Array<{ score: number; item: { type: string; label: string; content: string } }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const skillFile = path.join(skillDir, id, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      let content = "";
      try { content = fs.readFileSync(skillFile, "utf-8"); } catch { continue; }
      const m = content.match(/description:\s*["']([^"']+)["']/);
      const description = m ? m[1] : "";
      const tokens = (description + " " + id).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w));
      let score = 0;
      for (const kw of tokens) { if (lower.includes(kw)) score++; }
      if (score >= 2) {
        scored.push({ score, item: { type: "skill", label: id, content } });
      }
    }
    if (scored.length === 0) return [];
    scored.sort((a, b) => b.score - a.score);
    debugLog(` autoResolveSkillContext: best="${scored[0].item.label}" score=${scored[0].score}`);
    return [scored[0].item];
  }

  private async handleUserMessage(text: string, context?: Array<{ type: string; label: string; path?: string; content?: string }>): Promise<void> {
    const skillCtx = this.resolveSkillContext(text);
    const autoCtx = this.isPlainChat(text) ? this.autoResolveSkillContext(text) : [];
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
    const enrichedText = buildEnrichedText(finalText, mergedContext);
    debugLog(` handleUserMessage: "${finalText.slice(0, 80)}" (context: ${mergedContext.length} items, explicitSkills: ${skillCtx.length}, autoSkills: ${autoCtx.length})`);
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
    const gate = this.getEngine().approvalGate;
    if (!gate) return;
    const normalizedDecision = decision === "approve" ? "approve" : "reject";
    // Store pattern for future auto-approve
    if (normalizedDecision === "approve" && rememberPattern) {
      this.getEngine().commandPatternMatcher.addPattern(rememberPattern);
    }
    gate.resolveApproval(toolId, normalizedDecision);
  }

  private handleNodeClick(nodeId: string): void {
    const nodes = this.getEngine().getCurrentNodeStates();
    const node = nodes.find(n => n.id === nodeId);
    if (node) { this.sendToWebview({ type: "chat:nodeDetails", node, recentOutputs: [] }); }
  }

  /** SA4E-186: Route SELECT_AGENT to engine and confirm to webview. */
  private async handleSelectAgent(agentId: string | null): Promise<void> {
    if (agentId) { await this.getEngine().selectAgent(agentId); }
  }
}

