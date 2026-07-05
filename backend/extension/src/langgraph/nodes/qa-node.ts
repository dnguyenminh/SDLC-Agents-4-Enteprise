/**
 * QaNode --- KSA-210, KSA-242
 * QA Engineer agent node. Handles test planning (STP/STC) and test execution.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";
import { QA_TEMPLATES, QA_SYSTEM_PROMPT_FALLBACK } from "./qa-prompts";

export class QaNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    if (state.currentPhase === "test_planning") return this.executeTestPlanning(state);
    if (state.currentPhase === "testing") return this.executeTestExecution(state);
    if (state.currentPhase === "user_guide") return this.executeUgVerification(state);
    return this.executeTestPlanning(state);
  }

  private async executeTestPlanning(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(this.nodeId, `[QA] Creating STP/STC for ${state.ticketKey}...`, state.currentStreamId);
    const llmAvailable = await this.isLlmAvailable();
    let result: string;
    if (llmAvailable) {
      this.streamHandler.emitToken(this.nodeId, `  -> Step 1: Reading context...`, state.currentStreamId);
      let kbContext = "";
      try { kbContext = await this.kbSearch(`${state.ticketKey} BRD FSD TDD requirements`); } catch { /* */ }
      const brdContent = await this.readWorkspaceFile(state.documents.brd?.path || `documents/${state.ticketKey}/BRD.md`) || "";
      const fsdContent = await this.readWorkspaceFile(state.documents.fsd?.path || `documents/${state.ticketKey}/FSD.md`) || "";
      const tddContent = await this.readWorkspaceFile(state.documents.tdd?.path || `documents/${state.ticketKey}/TDD.md`) || "";
      this.streamHandler.emitToken(this.nodeId, `  -> Step 2: Reading templates...`, state.currentStreamId);
      const stpTemplate = await this.readWorkspaceFile(QA_TEMPLATES.STP) || "[STP template not found]";
      const stcTemplate = await this.readWorkspaceFile(QA_TEMPLATES.STC) || "[STC template not found]";
      this.streamHandler.emitToken(this.nodeId, `  -> Step 3: Generating STP/STC...`, state.currentStreamId);
      const userPrompt = `Create STP and STC for ticket ${state.ticketKey}.\n\n## STP TEMPLATE\n\n${stpTemplate}\n\n## STC TEMPLATE\n\n${stcTemplate}\n\n## BRD\n\n${brdContent.slice(0, 10000)}\n\n## FSD\n\n${fsdContent.slice(0, 10000)}\n\n## TDD\n\n${tddContent.slice(0, 10000)}\n\n${kbContext ? `## KB CONTEXT\n\n${kbContext}` : ""}\n\nRequirements:\n- 6 test levels: PBT, UT, IT, E2E-API, E2E-UI, SIT\n- RTM with 100% coverage\n- Test data CSV files\n\nDIAGRAMS (MANDATORY):\n- documents/${state.ticketKey}/diagrams/test-coverage.drawio + .png\n- documents/${state.ticketKey}/diagrams/test-execution-flow.drawio + .png`;
      const workspaceRoot = this.getWorkspaceRoot();
      let systemPrompt = await this.loadAgentPrompt("qa-agent", QA_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) { const rules = await loadSteeringRules(workspaceRoot, "langgraph"); systemPrompt = injectSteering(systemPrompt, rules); }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
      this.streamHandler.emitToken(this.nodeId, `  -> Step 4: Writing STP.md + STC.md...`, state.currentStreamId);
      await this.writeWorkspaceFile(`documents/${state.ticketKey}/STP.md`, result);
      this.streamHandler.emitToken(this.nodeId, `  -> Step 5: Exporting DOCX...`, state.currentStreamId);
      const ver = (state.documents.stp?.version || 0) + 1;
      await this.exportDocx(`documents/${state.ticketKey}/STP.md`, `STP-v${ver}-${state.ticketKey}`);
      this.streamHandler.emitToken(this.nodeId, `  -> Step 6: KB ingest...`, state.currentStreamId);
      await this.kbIngestFile(`documents/${state.ticketKey}/STP.md`, "DOCUMENT");
      this.streamHandler.emitToken(this.nodeId, `  Done STP/STC pipeline`, state.currentStreamId);
    } else {
      result = await this.callMcp("invoke_sub_agent", { name: "qa-agent", prompt: `Tao STP va STC cho ${state.ticketKey}. PHAI tao draw.io diagrams.` });
    }
    const output: AgentOutput = { nodeId: this.nodeId, content: result, timestamp: new Date().toISOString(), metadata: { phase: "test_planning", docType: "STP/STC", usedLlm: llmAvailable, kbIngested: true } };
    const documents = { ...state.documents };
    documents.stp = { status: "done", version: (documents.stp?.version || 0) + 1, path: `documents/${state.ticketKey}/STP.md`, completedAt: new Date().toISOString() } satisfies DocumentState;
    documents.stc = { status: "done", version: (documents.stc?.version || 0) + 1, path: `documents/${state.ticketKey}/STC.md`, completedAt: new Date().toISOString() } satisfies DocumentState;
    return { agentOutputs: [output], documents };
  }

  private async executeTestExecution(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(this.nodeId, `[QA] Executing tests for ${state.ticketKey}...`, state.currentStreamId);
    const llmAvailable = await this.isLlmAvailable();
    let result: string;
    if (llmAvailable) {
      const reportTemplate = await this.readWorkspaceFile(QA_TEMPLATES.TEST_REPORT) || "";
      const userPrompt = `Execute automated tests for ${state.ticketKey}.\n\nTEST REPORT TEMPLATE:\n\n${reportTemplate}\n\nRun ./gradlew test and report results.\nOutput: documents/${state.ticketKey}/TEST-REPORT-${state.ticketKey}.md`;
      const workspaceRoot = this.getWorkspaceRoot();
      let systemPrompt = await this.loadAgentPrompt("qa-agent", QA_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) { const rules = await loadSteeringRules(workspaceRoot, "langgraph"); systemPrompt = injectSteering(systemPrompt, rules); }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
      await this.writeWorkspaceFile(`documents/${state.ticketKey}/TEST-REPORT-${state.ticketKey}.md`, result);
      await this.exportDocx(`documents/${state.ticketKey}/TEST-REPORT-${state.ticketKey}.md`, `TEST-REPORT-${state.ticketKey}`);
      await this.kbIngestFile(`documents/${state.ticketKey}/TEST-REPORT-${state.ticketKey}.md`, "DOCUMENT");
    } else {
      result = await this.callMcp("invoke_sub_agent", { name: "qa-agent", prompt: `Chay automated tests cho ${state.ticketKey}. Run ./gradlew test.` });
    }
    return { agentOutputs: [{ nodeId: this.nodeId, content: result, timestamp: new Date().toISOString(), metadata: { phase: "testing", usedLlm: llmAvailable, kbIngested: true } }] };
  }

  private async executeUgVerification(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(this.nodeId, `[QA] Verifying User Guide for ${state.ticketKey}...`, state.currentStreamId);
    const result = await this.callMcp("invoke_sub_agent", { name: "qa-agent", prompt: `Verify User Guide cho ${state.ticketKey}. Follow instructions, report PASS/FAIL.` });
    return { agentOutputs: [{ nodeId: this.nodeId, content: result, timestamp: new Date().toISOString(), metadata: { phase: "user_guide", action: "ug_verification" } }], parallelResults: { qa_ug: result } };
  }
}
