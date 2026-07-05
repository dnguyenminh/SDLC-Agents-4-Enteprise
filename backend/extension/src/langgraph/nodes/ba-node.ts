/**
 * BaNode --- KSA-210, KSA-217, KSA-242
 * Business Analyst agent node. Falls back to invoke_sub_agent("ba-agent")
 * when LLM unavailable, otherwise uses runAgentWorkflow.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { BA_TEMPLATES, BA_SYSTEM_PROMPT_FALLBACK } from "./ba-prompts";

export { BA_TEMPLATES, BA_SYSTEM_PROMPT_FALLBACK } from "./ba-prompts";

export class BaNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const phase = state.currentPhase;
    const docType = phase === "requirements" ? "BRD" : "FSD";
    const ticketKey = state.ticketKey;

    this.streamHandler.emitToken(
      this.nodeId,
      `[BA] Starting ${docType} pipeline for ${ticketKey}...`,
      state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      result = await this.runAgentWorkflow("ba-agent", state, {
        docType,
        outputPath: `documents/${ticketKey}/${docType}.md`,
      });
    } else {
      const prompt = phase === "requirements"
        ? `Tao BRD cho ${ticketKey}. PHAI tao draw.io diagrams (use-case.drawio + business-flow.drawio) va export PNG.`
        : `Tao FSD cho ${ticketKey}. Doc BRD tu KB truoc. PHAI tao draw.io diagrams va export PNG.`;
      result = await this.callMcp("invoke_sub_agent", { name: "ba-agent", prompt });
    }

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { docType, phase, usedLlm: llmAvailable, kbIngested: true },
    };

    const documents = { ...state.documents };
    const docKey = docType.toLowerCase();
    documents[docKey] = {
      status: "done",
      version: (documents[docKey]?.version || 0) + 1,
      path: `documents/${ticketKey}/${docType}.md`,
      completedAt: new Date().toISOString(),
    } satisfies DocumentState;

    return { agentOutputs: [output], documents };
  }
}
