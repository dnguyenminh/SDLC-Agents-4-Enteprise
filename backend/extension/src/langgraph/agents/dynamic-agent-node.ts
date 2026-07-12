/**
 * DynamicAgentNode — KSA (Dynamic Agent Support)
 * Extends BaseNode to support dynamic agent config from agent-registry.
 * Uses LLM provider first, falls back to MCP bridge if no LLM is configured.
 */

import * as fs from "fs";
import * as path from "path";
import { BaseNode } from "../core/base-node";
import { PipelineState } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider, LlmMessage } from "../core/llm-provider";
import type { AgentConfig } from "./registry";

export class DynamicAgentNode extends BaseNode {
  private config: AgentConfig;

  constructor(
    id: string,
    mcpBridge: McpBridge,
    streamHandler: StreamHandler,
    config: AgentConfig,
    llmProvider?: LlmProvider
  ) {
    super(id, mcpBridge, streamHandler, llmProvider);
    this.config = config;
  }

  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const agentId = this.config.id;

    // Attempt LLM-based execution first
    if (this.llmProvider) {
      return this.executeWithLlm(state, agentId);
    }

    // Fallback: use MCP bridge when no LLM provider
    return this.executeWithMcp(state, agentId);
  }

  private async executeWithLlm(state: PipelineState, agentId: string): Promise<Partial<PipelineState>> {
    const { ticketKey, workspaceRoot } = state;
    const promptContent = await this.loadStepPrompt(workspaceRoot);
    const context = this.buildContext(state);
    const messages: LlmMessage[] = [
      { role: "system", content: promptContent },
      { role: "user", content: `Execute ${this.config.label} for ticket ${ticketKey}. Context: ${context}` },
    ];

    const result = await this.llmProvider!.chat(messages);

    // Write output document if configured
    if (this.config.outputDoc && workspaceRoot) {
      await this.writeDoc(workspaceRoot, ticketKey, this.config.outputDoc, result);
    }

    // Ingest into KB
    const kbEntry = this.formatKBEntry(agentId, result, state);
    await this.ingestKB(kbEntry);

    return {
      agentOutputs: [{
        nodeId: agentId,
        content: result,
        timestamp: new Date().toISOString(),
        metadata: {
          action: this.config.type,
          docType: this.config.outputDoc || "none",
          label: this.config.label,
        },
      }],
      currentPhase: this.config.phase,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  private async executeWithMcp(state: PipelineState, agentId: string): Promise<Partial<PipelineState>> {
    const { sessionId, ticketKey, workspaceRoot, currentPhase } = state;

    const mcpResult = await this.mcpBridge.callTool(
      agentId,
      {
        ticketKey,
        sessionId: sessionId ?? "",
        phase: currentPhase,
        input: JSON.stringify(state),
      }
    );

    let content: string;
    try {
      const parsed = JSON.parse(mcpResult);
      content = parsed?.content?.[0]?.text ?? mcpResult;
    } catch {
      content = mcpResult || "(no output)";
    }

    return {
      agentOutputs: [{
        nodeId: agentId,
        content,
        timestamp: new Date().toISOString(),
        metadata: {
          action: this.config.type,
          docType: this.config.outputDoc || "none",
          label: this.config.label,
          mcpFallback: true,
        },
      }],
      currentPhase: this.config.phase,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  private loadStepPrompt(workspaceRoot?: string): string {
    const filePath = this.config.stepFilePath;
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return this.stripFrontmatter(raw);
    }
    if (workspaceRoot) {
      const fallback = path.join(workspaceRoot, ".kiro", "agents", `${this.config.id}.md`);
      if (fs.existsSync(fallback)) {
        return this.stripFrontmatter(fs.readFileSync(fallback, "utf-8"));
      }
    }
    return `You are ${this.config.label}. Execute ${this.config.id} in phase ${this.config.phase}.`;
  }

  private stripFrontmatter(content: string): string {
    const match = content.match(/^---\n[\s\S]*?\n---\n*/);
    return match ? content.slice(match[0].length).trim() : content.trim();
  }

  private buildContext(state: PipelineState): string {
    const parts: string[] = [];
    if (state.ticketSummary) parts.push(`Ticket: ${state.ticketSummary}`);
    if (state.ticketKey) parts.push(`Key: ${state.ticketKey}`);
    if (state.currentPhase) parts.push(`Phase: ${state.currentPhase}`);
    if (state.agentOutputs?.length) {
      const lastOutput = state.agentOutputs[state.agentOutputs.length - 1];
      parts.push(`Previous: ${lastOutput.nodeId}: ${lastOutput.content.substring(0, 200)}`);
    }
    return parts.join(" | ");
  }

  private async writeDoc(workspaceRoot: string, ticketKey: string | undefined, docName: string, content: string): Promise<void> {
    const docDir = path.join(workspaceRoot, "documents", ticketKey || "unknown");
    fs.mkdirSync(docDir, { recursive: true });
    fs.writeFileSync(path.join(docDir, docName), content, "utf-8");
  }

  private formatKBEntry(agentId: string, content: string, state: PipelineState): string {
    return `Agent: ${agentId}\nTicket: ${state.ticketKey || "unknown"}\nPhase: ${state.currentPhase || "unknown"}\n---\n${content.substring(0, 2000)}`;
  }

  private async ingestKB(_content: string): Promise<void> {
    // Placeholder for knowledge base ingestion
    // In production: call codeIntel.memIngest({ content, type: "CONTEXT", source: this.config.id })
  }
}
