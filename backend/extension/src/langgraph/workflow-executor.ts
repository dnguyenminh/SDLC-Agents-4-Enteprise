/**
 * WorkflowExecutor --- KSA-243
 * Executes parsed workflow steps from agent .md files dynamically.
 */

import type { PipelineState } from "./state";
import type { StreamHandler } from "./stream-handler";
import { parseAgentWorkflow, type ParsedWorkflow, type WorkflowStep } from "./workflow-parser";
import { ExecutionContext, executeAction } from "./workflow-executor-actions";

/**
 * Interface matching BaseNode utility methods that WorkflowExecutor needs.
 */
export interface WorkflowNodeContext {
  readWorkspaceFile(path: string): Promise<string | null>;
  writeWorkspaceFile(path: string, content: string): Promise<boolean>;
  appendWorkspaceFile(path: string, content: string): Promise<boolean>;
  getJiraIssue(issueKey: string): Promise<string>;
  getJiraIssueRecursive(issueKey: string, maxDepth?: number, maxTickets?: number): Promise<string>;
  kbSearch(query: string, limit?: number): Promise<string>;
  kbIngest(content: string, type: string, source: string, tags: string[]): Promise<void>;
  kbIngestFile(filePath: string, type?: string): Promise<void>;
  readCodeIntelligence(moduleName?: string): Promise<string | null>;
  exportDocx(mdPath: string, docxName: string): Promise<string | null>;
  exportDrawioPng(drawioPath: string): Promise<boolean>;
  execShell(command: string, cwd?: string): Promise<string>;
  execGit(args: string): Promise<string>;
  callLlmStreamFull(systemPrompt: string, userPrompt: string, state: PipelineState): Promise<string>;
  discoverTools(query: string, threshold?: number, topK?: number): Promise<string>;
  callMcp(toolName: string, args: Record<string, unknown>): Promise<string>;
  getWorkspaceRoot(): string | null;
  readonly streamHandler: StreamHandler;
  readonly nodeId: string;
}

export class WorkflowExecutor {
  constructor(private readonly node: WorkflowNodeContext) {}

  async run(agentName: string, state: PipelineState, vars: Record<string, string> = {}): Promise<string> {
    const agentContent = await this.node.readWorkspaceFile(`.kiro/agents/${agentName}.md`);
    if (!agentContent) { throw new Error(`Agent file not found: .kiro/agents/${agentName}.md`); }
    const workflow = parseAgentWorkflow(agentName, agentContent);
    const skillContent = await this.loadSkills(workflow.skills);
    const ctx: ExecutionContext = {
      ticketKey: state.ticketKey, docType: vars.docType,
      templateContent: "", jiraContext: "", kbContext: "", codeIntelContext: "",
      skillContent, generatedContent: "", outputPath: vars.outputPath || `documents/${state.ticketKey}/`, ...vars,
    };
    this.emitStatus(`[${agentName}] Executing ${workflow.steps.length} steps dynamically...`, state);
    for (const step of workflow.steps) {
      if (step.isConditional && step.condition) {
        if (!this.evaluateCondition(step.condition, ctx)) {
          this.emitStatus(`  skip ${step.id}: ${step.title}`, state);
          continue;
        }
      }
      this.emitStatus(`  -> ${step.id}: ${step.title}`, state);
      for (const action of step.actions) {
        await executeAction(action, ctx, state, workflow.rolePrompt, this.node);
      }
    }
    return ctx.generatedContent;
  }

  private async loadSkills(skillPaths: string[]): Promise<string> {
    const contents: string[] = [];
    for (const path of skillPaths) {
      const content = await this.node.readWorkspaceFile(path);
      if (content) {
        const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
        contents.push(fmMatch ? fmMatch[1].trim() : content.trim());
      }
    }
    return contents.join("\n\n---\n\n");
  }

  private evaluateCondition(condition: string, ctx: ExecutionContext): boolean {
    const lower = condition.toLowerCase();
    if (lower.includes("fsd") && ctx.docType !== "FSD") return false;
    if (lower.includes("brd") && ctx.docType !== "BRD") return false;
    return true;
  }

  private emitStatus(message: string, state: PipelineState): void {
    this.node.streamHandler.emitToken(this.node.nodeId, message, state.currentStreamId);
  }
}
