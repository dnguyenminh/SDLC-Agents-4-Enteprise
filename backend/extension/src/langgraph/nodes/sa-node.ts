/**
 * SaNode — KSA-210, KSA-242
 * Solution Architect agent node. Full multi-step workflow:
 * KB search → Code Intelligence → DB schema → Template read → LLM generate →
 * Write file → Diagrams → PNG export → DOCX export → KB ingest.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";

const TDD_TEMPLATE = "documents/templates/TDD-TEMPLATE.md";

const SA_SYSTEM_PROMPT_FALLBACK = `You are a Solution Architect agent for an SDLC pipeline.
Your role is to create comprehensive Technical Design Documents (TDD) based on BRD and FSD.

Responsibilities:
- Analyze system architecture and define component design
- Design API contracts (REST/GraphQL endpoints, request/response schemas)
- Design database schema (tables, relationships, migrations)
- Define class/module design with responsibilities
- Create implementation checklist for developers
- Define error handling and security design
- Follow the provided template structure EXACTLY

DIAGRAM RULES (MANDATORY):
- MUST create draw.io diagrams: architecture.drawio + component.drawio + class-*.drawio
- All diagrams stored at documents/{TICKET}/diagrams/
- XML must start with <mxGraphModel>, NOT <mxfile>
- Every edge uses expanded form with <mxGeometry relative="1" as="geometry"/>
- Include Diagram Index table in appendix

Always produce complete, production-ready documents in Markdown format.`;

export class SaNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const ticketKey = state.ticketKey;

    this.streamHandler.emitToken(
      this.nodeId, `[SA] Starting TDD pipeline for ${ticketKey}...`, state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      result = await this.executeFullPipeline(state);
    } else {
      result = await this.callMcp("invoke_sub_agent", {
        name: "sa-agent",
        prompt: `Tao TDD cho ${ticketKey}. Doc code intelligence data va FSD. PHAI tao draw.io diagrams (architecture.drawio + component.drawio) va export PNG.`,
      });
    }

    // KB ingest
    await this.kbIngestFile(`documents/${ticketKey}/TDD.md`, "DOCUMENT");

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { docType: "TDD", phase: "design", usedLlm: llmAvailable, kbIngested: true },
    };

    const documents = { ...state.documents };
    documents.tdd = {
      status: "done",
      version: (documents.tdd?.version || 0) + 1,
      path: `documents/${ticketKey}/TDD.md`,
      completedAt: new Date().toISOString(),
    } satisfies DocumentState;

    return { agentOutputs: [output], documents, currentPhase: "design" };
  }

  private async executeFullPipeline(state: PipelineState): Promise<string> {
    const ticketKey = state.ticketKey;

    // Step 1: Read FSD and BRD from KB
    this.streamHandler.emitToken(this.nodeId, `  → Step 1: Searching KB for FSD/BRD...`, state.currentStreamId);
    let kbContext = "";
    try {
      kbContext = await this.kbSearch(`${ticketKey} FSD BRD requirements specification`);
    } catch { /* continue */ }

    // Step 2: Read Code Intelligence
    this.streamHandler.emitToken(this.nodeId, `  → Step 2: Reading Code Intelligence...`, state.currentStreamId);
    const codeIntel = await this.readCodeIntelligence() || "";

    // Step 3: Read FSD file directly (fallback if KB incomplete)
    let fsdContent = "";
    const fsdPath = state.documents.fsd?.path || `documents/${ticketKey}/FSD.md`;
    const fsdFile = await this.readWorkspaceFile(fsdPath);
    if (fsdFile) fsdContent = fsdFile;

    // Step 4: Read template
    this.streamHandler.emitToken(this.nodeId, `  → Step 3: Reading TDD template...`, state.currentStreamId);
    const template = await this.readWorkspaceFile(TDD_TEMPLATE) || "[Template not found]";

    // Step 5: Generate TDD via LLM
    this.streamHandler.emitToken(this.nodeId, `  → Step 4: Generating TDD...`, state.currentStreamId);
    const userPrompt = this.buildPrompt(ticketKey, state, template, kbContext, codeIntel, fsdContent);

    const workspaceRoot = this.getWorkspaceRoot();
    let systemPrompt = await this.loadAgentPrompt("sa-agent", SA_SYSTEM_PROMPT_FALLBACK);
    if (workspaceRoot) {
      const rules = await loadSteeringRules(workspaceRoot, "langgraph");
      systemPrompt = injectSteering(systemPrompt, rules);
    }

    const content = await this.callLlmStreamFull(systemPrompt, userPrompt, state);

    // Step 6: Write file
    this.streamHandler.emitToken(this.nodeId, `  → Step 5: Writing TDD.md...`, state.currentStreamId);
    await this.writeWorkspaceFile(`documents/${ticketKey}/TDD.md`, content);

    // Step 7: Export DOCX
    this.streamHandler.emitToken(this.nodeId, `  → Step 6: Exporting DOCX...`, state.currentStreamId);
    const version = (state.documents.tdd?.version || 0) + 1;
    await this.exportDocx(`documents/${ticketKey}/TDD.md`, `TDD-v${version}-${ticketKey}`);

    this.streamHandler.emitToken(this.nodeId, `  ✅ TDD pipeline complete`, state.currentStreamId);
    return content;
  }

  private buildPrompt(
    ticketKey: string, state: PipelineState, template: string,
    kbContext: string, codeIntel: string, fsdContent: string
  ): string {
    const sections: string[] = [];
    sections.push(`Create a TDD for ticket ${ticketKey}.`);
    sections.push(`\n## TEMPLATE\n\n${template}`);

    if (fsdContent) sections.push(`\n## FSD CONTENT\n\n${fsdContent.slice(0, 15000)}`);
    if (kbContext) sections.push(`\n## KB CONTEXT\n\n${kbContext}`);
    if (codeIntel) sections.push(`\n## CODE INTELLIGENCE\n\n${codeIntel}\n\nUse actual patterns, table names, API routes from above.`);

    const chatContext = state.chatHistory.filter(m => m.role === "user").map(m => m.content).join("\n");
    if (chatContext) sections.push(`\n## USER CONTEXT\n\n${chatContext}`);

    sections.push(`\n## DIAGRAMS (MANDATORY)

Generate draw.io XML for:
1. documents/${ticketKey}/diagrams/architecture.drawio
2. documents/${ticketKey}/diagrams/component.drawio
3. documents/${ticketKey}/diagrams/class-main.drawio

Rules: <mxGraphModel> root, expanded edges with <mxGeometry>, Diagram Index table.`);

    return sections.join("\n");
  }
}
