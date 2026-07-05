/**
 * SmNode — KSA-210
 * Scrum Master routing node. Analyzes ticket context via MCP mem_search
 * and determines which agent should execute next.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput } from "../state";

export class SmNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    // Fetch ticket context from KB
    const contextResult = await this.callMcp("mem_search", {
      query: `${state.ticketKey} context requirements`,
    });

    this.streamHandler.emitToken(
      this.nodeId,
      `[SM] Routing pipeline for ${state.ticketKey} — phase: ${state.currentPhase}`,
      state.currentStreamId
    );

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: contextResult || `SM routed ${state.ticketKey} to phase: ${state.currentPhase}`,
      timestamp: new Date().toISOString(),
      metadata: { phase: state.currentPhase, ticketKey: state.ticketKey },
    };

    return {
      agentOutputs: [output],
      pipelineStatus: "running",
    };
  }
}
