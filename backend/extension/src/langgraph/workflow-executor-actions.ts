/**
 * WorkflowExecutor action runners --- KSA-243
 * Individual action execution logic extracted from WorkflowExecutor.
 */

import type { StepAction } from "./workflow-parser";
import type { WorkflowNodeContext } from "./workflow-executor";
import type { PipelineState } from "./state";
import { loadSteeringRules, injectSteering } from "./steering-loader";

export interface ExecutionContext {
  ticketKey: string;
  docType?: string;
  templateContent: string;
  jiraContext: string;
  kbContext: string;
  codeIntelContext: string;
  skillContent: string;
  generatedContent: string;
  outputPath: string;
  [key: string]: unknown;
}

export async function executeAction(
  action: StepAction, ctx: ExecutionContext, state: PipelineState,
  rolePrompt: string, node: WorkflowNodeContext
): Promise<void> {
  const ticketKey = ctx.ticketKey;
  try {
    switch (action.type) {
      case "read_template": {
        const path = resolvePath(action.params.path || "", ctx);
        const content = await node.readWorkspaceFile(path);
        if (content) ctx.templateContent = content;
        break;
      }
      case "read_file": {
        const path = resolvePath(action.params.path || "", ctx);
        const content = await node.readWorkspaceFile(path);
        if (content) {
          const key = path.split("/").pop()?.replace(/\.\w+$/, "") || "file";
          (ctx as Record<string, unknown>)[key] = content;
        }
        break;
      }
      case "fetch_jira": {
        try { ctx.jiraContext = await node.getJiraIssue(ticketKey); } catch { ctx.jiraContext = "[Jira unavailable]"; }
        break;
      }
      case "fetch_jira_recursive": {
        try { ctx.jiraContext = await node.getJiraIssueRecursive(ticketKey, 2, 10); } catch { ctx.jiraContext = "[Jira unavailable]"; }
        break;
      }
      case "kb_search": {
        try {
          const query = (action.params.query || `${ticketKey} context`).replace(/\{TICKET-KEY\}/g, ticketKey).replace(/\{TICKET\}/g, ticketKey);
          ctx.kbContext += "\n" + await node.kbSearch(query);
        } catch { /* */ }
        break;
      }
      case "kb_ingest": {
        await node.kbIngest(ctx.generatedContent.slice(0, 5000), "DOCUMENT", `workflow-${ctx.docType || "doc"}`, [ticketKey, ctx.docType || "document", "langgraph"]);
        break;
      }
      case "kb_ingest_file": {
        const path = resolvePath(action.params.path || ctx.outputPath, ctx);
        await node.kbIngestFile(path);
        break;
      }
      case "read_code_intelligence": {
        ctx.codeIntelContext = await node.readCodeIntelligence() || "";
        break;
      }
      case "generate_llm": {
        const userPrompt = buildLlmPrompt(ctx, state);
        const workspaceRoot = node.getWorkspaceRoot();
        let systemPrompt = rolePrompt + (ctx.skillContent ? "\n\n" + ctx.skillContent : "");
        if (workspaceRoot) {
          const rules = await loadSteeringRules(workspaceRoot, "langgraph");
          systemPrompt = injectSteering(systemPrompt, rules);
        }
        ctx.generatedContent = await node.callLlmStreamFull(systemPrompt, userPrompt, state);
        break;
      }
      case "write_file": {
        const path = resolvePath(action.params.path || ctx.outputPath, ctx);
        if (ctx.generatedContent) await node.writeWorkspaceFile(path, ctx.generatedContent);
        break;
      }
      case "append_file": {
        const path = resolvePath(action.params.path || ctx.outputPath, ctx);
        if (ctx.generatedContent) await node.appendWorkspaceFile(path, ctx.generatedContent);
        break;
      }
      case "export_docx": {
        const docxName = `${ctx.docType || "DOC"}-v1-${ticketKey}`;
        await node.exportDocx(ctx.outputPath, docxName);
        break;
      }
      case "export_drawio_png": {
        const drawioPath = action.params.path || `documents/${ticketKey}/diagrams/`;
        await node.exportDrawioPng(drawioPath);
        break;
      }
      case "exec_shell": {
        const command = (action.params.command || "").replace(/\{TICKET-KEY\}/g, ticketKey).replace(/\{TICKET\}/g, ticketKey);
        if (command) { try { await node.execShell(command); } catch { /* */ } }
        break;
      }
      case "exec_git": {
        const args = (action.params.args || "").replace(/\{TICKET-KEY\}/g, ticketKey).replace(/\{TICKET\}/g, ticketKey);
        if (args) { try { await node.execGit(args); } catch { /* */ } }
        break;
      }
      case "discover_tools": {
        await node.discoverTools("get issue details project tracker");
        await node.discoverTools("search knowledge base");
        break;
      }
      case "load_skill": {
        const path = action.params.path || "";
        if (path) { const content = await node.readWorkspaceFile(path); if (content) ctx.skillContent += "\n\n" + content; }
        break;
      }
      default: break;
    }
  } catch { /* Individual action failure is non-blocking */ }
}

export function buildLlmPrompt(ctx: ExecutionContext, state: PipelineState): string {
  const sections: string[] = [];
  sections.push(`Create ${ctx.docType || "document"} for ticket ${ctx.ticketKey}.`);
  if (ctx.templateContent) sections.push(`\n## TEMPLATE\n\n${ctx.templateContent}`);
  if (ctx.jiraContext && !ctx.jiraContext.includes("unavailable")) sections.push(`\n## JIRA DATA\n\n${ctx.jiraContext.slice(0, 15000)}`);
  if (ctx.kbContext.trim()) sections.push(`\n## KB CONTEXT\n\n${ctx.kbContext.slice(0, 5000)}`);
  if (ctx.codeIntelContext) sections.push(`\n## CODE INTELLIGENCE\n\n${ctx.codeIntelContext.slice(0, 8000)}`);
  const chatContext = state.chatHistory?.filter(m => m.role === "user").map(m => m.content).join("\n");
  if (chatContext) sections.push(`\n## USER REQUIREMENTS\n\n${chatContext}`);
  return sections.join("\n");
}

export function resolvePath(path: string, ctx: ExecutionContext): string {
  return path.replace(/\{TICKET-KEY\}/g, ctx.ticketKey).replace(/\{TICKET\}/g, ctx.ticketKey);
}
