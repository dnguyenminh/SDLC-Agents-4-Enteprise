/**
 * DevNode --- KSA-210, KSA-242
 * Developer agent node. Implementation (Phase 5) and User Guide (Phase 5.5).
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";
import { debugError } from "../../debug-logger";
import { UG_TEMPLATE, DEV_SYSTEM_PROMPT_FALLBACK } from "./dev-prompts";

export class DevNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    if (state.currentPhase === "user_guide") return this.executeUserGuide(state);
    return this.executeImplementation(state);
  }

  private async executeImplementation(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(this.nodeId, `[DEV] Implementing code for ${state.ticketKey}...`, state.currentStreamId);
    const llmAvailable = await this.isLlmAvailable();
    let result: string;
    if (llmAvailable) {
      this.streamHandler.emitToken(this.nodeId, `  -> Step 1: Reading TDD + Code Intel...`, state.currentStreamId);
      const tddContent = await this.readWorkspaceFile(state.documents.tdd?.path || `documents/${state.ticketKey}/TDD.md`) || "";
      const codeIntel = await this.readCodeIntelligence() || "";
      let kbContext = "";
      try { kbContext = await this.kbSearch(`${state.ticketKey} TDD implementation design`); } catch (err) { debugError(`[DevNode] KB search failed`, err as Error); }
      this.streamHandler.emitToken(this.nodeId, `  -> Step 2: Generating implementation...`, state.currentStreamId);
      const userPrompt = `Implement code for ticket ${state.ticketKey}.\n\n## TDD\n\n${tddContent.slice(0, 15000)}\n\n## CODE INTELLIGENCE\n\n${codeIntel.slice(0, 8000)}\n\n${kbContext ? `## KB CONTEXT\n\n${kbContext}` : ""}\n\nFollow TDD architecture. Implement all layers. Ensure code compiles.`;
      const workspaceRoot = this.getWorkspaceRoot();
      let systemPrompt = await this.loadAgentPrompt("dev-agent", DEV_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) { const rules = await loadSteeringRules(workspaceRoot, "langgraph"); systemPrompt = injectSteering(systemPrompt, rules); }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
    } else {
      result = await this.callMcp("invoke_sub_agent", { name: "dev-agent", prompt: `Implement code cho ${state.ticketKey} theo TDD.` });
    }
    const output: AgentOutput = { nodeId: this.nodeId, content: result, timestamp: new Date().toISOString(), metadata: { phase: "implementation", usedLlm: llmAvailable } };
    if (llmAvailable) {
      this.streamHandler.emitToken(this.nodeId, `  -> Updating code intelligence index...`, state.currentStreamId);
      try { await this.execShell("npx tsx src/full-indexer.ts ../../../", ".analysis/code-intelligence/scripts"); }
      catch { try { await this.kbIngest(`## ${state.ticketKey} Implementation\n\n${result.slice(0, 3000)}`, "CONTEXT", "langgraph-dev", [state.ticketKey, "implementation"]); } catch (err) { debugError(`[DevNode] KB ingest fallback failed`, err as Error); } }
    }
    return { agentOutputs: [output] };
  }

  private async executeUserGuide(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(this.nodeId, `[DEV] Writing User Guide for ${state.ticketKey}...`, state.currentStreamId);
    const llmAvailable = await this.isLlmAvailable();
    let result: string;
    if (llmAvailable) {
      this.streamHandler.emitToken(this.nodeId, `  -> Step 1: Reading template + context...`, state.currentStreamId);
      const ugTemplate = await this.readWorkspaceFile(UG_TEMPLATE) || "[UG template not found]";
      const codeIntel = await this.readCodeIntelligence() || "";
      let kbContext = "";
      try { kbContext = await this.kbSearch(`${state.ticketKey} BRD FSD TDD features`); } catch (err) { debugError(`[DevNode] KB search failed`, err as Error); }
      this.streamHandler.emitToken(this.nodeId, `  -> Step 2: Generating User Guide...`, state.currentStreamId);
      const userPrompt = `Write User Guide for ticket ${state.ticketKey}.\n\n## UG TEMPLATE\n\n${ugTemplate}\n\n## CODE INTELLIGENCE\n\n${codeIntel.slice(0, 8000)}\n\n${kbContext ? `## KB CONTEXT\n\n${kbContext}` : ""}\n\nInclude: Installation, Config Reference, Usage, Troubleshooting, API Reference, FAQ.\nOutput: documents/${state.ticketKey}/UG.md`;
      const workspaceRoot = this.getWorkspaceRoot();
      let systemPrompt = await this.loadAgentPrompt("dev-agent", DEV_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) { const rules = await loadSteeringRules(workspaceRoot, "langgraph"); systemPrompt = injectSteering(systemPrompt, rules); }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
      this.streamHandler.emitToken(this.nodeId, `  -> Step 3: Writing UG.md...`, state.currentStreamId);
      await this.writeWorkspaceFile(`documents/${state.ticketKey}/UG.md`, result);
      this.streamHandler.emitToken(this.nodeId, `  -> Step 4: Exporting DOCX...`, state.currentStreamId);
      const version = (state.documents.ug?.version || 0) + 1;
      await this.exportDocx(`documents/${state.ticketKey}/UG.md`, `UG-v${version}-${state.ticketKey}`);
      await this.kbIngestFile(`documents/${state.ticketKey}/UG.md`, "DOCUMENT");
      this.streamHandler.emitToken(this.nodeId, `  Done User Guide pipeline`, state.currentStreamId);
    } else {
      result = await this.callMcp("invoke_sub_agent", { name: "dev-agent", prompt: `Viet User Guide cho ${state.ticketKey}. Template: ${UG_TEMPLATE}.` });
    }
    const output: AgentOutput = { nodeId: this.nodeId, content: result, timestamp: new Date().toISOString(), metadata: { phase: "user_guide", usedLlm: llmAvailable, kbIngested: true } };
    const documents = { ...state.documents };
    documents.ug = { status: "done", version: (documents.ug?.version || 0) + 1, path: `documents/${state.ticketKey}/UG.md`, completedAt: new Date().toISOString() } satisfies DocumentState;
    return { agentOutputs: [output], documents, parallelResults: { dev_ug: result } };
  }
}
