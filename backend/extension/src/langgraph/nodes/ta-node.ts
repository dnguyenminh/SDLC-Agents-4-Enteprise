/**
 * TaNode — KSA-210, KSA-242
 * Technical Analyst agent node.
 * Reviews and enriches FSD with technical depth:
 * API contracts, integration specs, pseudocode, NFR quantification.
 * KSA-242: Added steering injection, KB ingest.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";

const TA_SYSTEM_PROMPT_FALLBACK = `You are a Technical Analyst agent for an SDLC pipeline.
Your role is to review and ENRICH existing FSD (Functional Specification Document) with technical depth.

You do NOT create the FSD from scratch — the BA has already written the business sections.
Your job is to:
1. Review Use Cases — add missing Alternative/Exception flows
2. Add/detail API Contracts — ensure developers can implement (request/response schemas)
3. Add Integration Requirements — full API contracts with schemas
4. Add pseudocode for complex business logic
5. Review Data Model — ensure consistency with actual codebase
6. Add Non-Functional Requirements with quantified targets
7. Flag Open Issues for unresolved technical decisions

Always modify the existing FSD.md in place. Never rewrite it from scratch.
Output your enrichments clearly marked with section headers.`;

export class TaNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(
      this.nodeId,
      `[TA] Enriching FSD for ${state.ticketKey}...`,
      state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      const userPrompt = this.buildUserPrompt(state);
      // KSA-242: Inject steering rules
      const workspaceRoot = require("vscode").workspace.workspaceFolders?.[0]?.uri.fsPath;
      let systemPrompt = await this.loadAgentPrompt("ta-agent", TA_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) {
        const rules = await loadSteeringRules(workspaceRoot, "langgraph");
        systemPrompt = injectSteering(systemPrompt, rules);
      }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
    } else {
      result = await this.callMcp("invoke_sub_agent", {
        name: "ta-agent",
        prompt: `Review va bo sung FSD cho ${state.ticketKey}. Doc code intelligence data. Bo sung API contracts, integration specs, pseudocode.`,
      });
    }

    // KSA-242: Ingest enriched FSD into KB
    try {
      await this.callMcp("mem_ingest", {
        content: result,
        type: "DOCUMENT",
        source: "langgraph-ta-fsd-enriched",
        tags: [state.ticketKey, "FSD", "ta-agent", "enriched", "langgraph"],
        scope: "USER",
      });
    } catch {
      // KB ingest failure is non-blocking
    }

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { phase: "specification", action: "enrich_fsd", usedLlm: llmAvailable, kbIngested: true },
    };

    const documents = { ...state.documents };
    documents.fsd = {
      status: "done",
      version: (documents.fsd?.version || 0) + 1,
      path: `documents/${state.ticketKey}/FSD.md`,
      completedAt: new Date().toISOString(),
    } satisfies DocumentState;

    return {
      agentOutputs: [output],
      documents,
    };
  }

  private buildUserPrompt(state: PipelineState): string {
    const ticketKey = state.ticketKey;
    const fsdPath = state.documents.fsd?.path || `documents/${ticketKey}/FSD.md`;
    const brdPath = state.documents.brd?.path || `documents/${ticketKey}/BRD.md`;

    return `Enrich the FSD for ticket ${ticketKey}.

FSD location: ${fsdPath}
BRD reference: ${brdPath}

Review the existing FSD and add:
1. Missing Alternative/Exception flows in Use Cases
2. Detailed API Contracts (request/response JSON schemas, HTTP methods, status codes)
3. Integration Requirements with external systems
4. Pseudocode for complex business logic
5. Data Model consistency check
6. Quantified Non-Functional Requirements (response time, throughput, availability)
7. Open Issues / Technical Decisions needed

Do NOT rewrite the FSD — only ADD and ENRICH existing content.
Mark your additions clearly so they can be reviewed.`;
  }
}
