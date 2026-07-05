/**
 * BaseNode — KSA-210 + KSA-233 + KSA-242
 * Abstract base class for all LangGraph pipeline nodes.
 * Core execution: timeout, retry loop, error handling, streaming, LLM wrappers.
 * Workspace utilities delegated to extracted modules.
 */

import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import { PipelineState, PipelineError } from "../state";
import { NonRecoverableError } from "../errors/non-recoverable-error";
import type { LlmProvider, LlmMessage, LlmOptions } from "../llm-provider";
import { WorkflowExecutor, type WorkflowNodeContext } from "../workflow-executor";
import {
  readWorkspaceFile, writeWorkspaceFile, appendWorkspaceFile,
  exportDocx, exportDrawioPng, getWorkspaceRoot, readCodeIntelligence,
} from "./workspace-file-ops";
import {
  callDynamicTool, getJiraIssue, getJiraIssueFields,
  searchJira, getJiraIssueRecursive,
} from "./jira-helpers";
import {
  fireAgentStopHooks, firePreToolUseHooks, fireFileHooks,
  execShell, execGit,
} from "./hook-helpers";
import { loadAgentPrompt } from "./agent-prompt-loader";

const NODE_TIMEOUT_MS = 300_000;
const TOOL_CALL_TIMEOUT_MS = 60_000;

export abstract class BaseNode {
  private static readonly MAX_RETRIES = 2;

  constructor(
    protected readonly nodeId: string,
    protected readonly mcpBridge: McpBridge,
    protected readonly streamHandler: StreamHandler,
    protected readonly llmProvider?: LlmProvider
  ) {}

  abstract execute(state: PipelineState): Promise<Partial<PipelineState>>;

  async run(state: PipelineState): Promise<Partial<PipelineState>> {
    const startTime = Date.now();
    let currentRetryCount = state.retryCount?.[this.nodeId] ?? 0;
    this.streamHandler.emitStatus(this.nodeId, "active", state.currentStreamId);

    for (let attempt = 0; attempt <= BaseNode.MAX_RETRIES; attempt++) {
      try {
        const result = await this.withTimeout(this.execute(state), NODE_TIMEOUT_MS);
        this.streamHandler.emitComplete(this.nodeId, Date.now() - startTime, state.currentStreamId);
        const outputContent = result.agentOutputs?.[0]?.content || "";
        await fireAgentStopHooks(this.nodeId, state, outputContent, this.mcpBridge);
        return {
          ...result,
          retryCount: { ...state.retryCount, [this.nodeId]: currentRetryCount },
          lastUpdatedAt: new Date().toISOString(),
        };
      } catch (error) {
        const err = error as Error;
        if (err instanceof NonRecoverableError) {
          return this.buildFailureState(state, err, currentRetryCount);
        }
        if (attempt < BaseNode.MAX_RETRIES) {
          currentRetryCount++;
          const delayMs = Math.pow(2, attempt) * 1000;
          this.streamHandler.emitRetry(this.nodeId, attempt + 1, BaseNode.MAX_RETRIES, delayMs, err.message, state.currentStreamId);
          await this.sleep(delayMs);
        } else {
          return this.buildFailureState(state, err, ++currentRetryCount);
        }
      }
    }
    return { pipelineStatus: "failed", lastUpdatedAt: new Date().toISOString() };
  }

  protected async callLlm(systemPrompt: string, userPrompt: string, options?: LlmOptions): Promise<string> {
    if (!this.llmProvider) throw new Error(`No LLM provider for node '${this.nodeId}'`);
    const messages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    return this.llmProvider.chat(messages, options);
  }

  protected async *callLlmStream(
    systemPrompt: string, userPrompt: string, state: PipelineState, options?: LlmOptions
  ): AsyncGenerator<string> {
    if (!this.llmProvider) throw new Error(`No LLM provider for node '${this.nodeId}'`);
    const messages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    for await (const token of this.llmProvider.chatStream(messages, options)) {
      this.streamHandler.emitToken(this.nodeId, token, state.currentStreamId);
      yield token;
    }
  }

  protected async callLlmStreamFull(
    systemPrompt: string, userPrompt: string, state: PipelineState, options?: LlmOptions
  ): Promise<string> {
    let result = "";
    for await (const token of this.callLlmStream(systemPrompt, userPrompt, state, options)) {
      result += token;
    }
    return result;
  }

  protected async isLlmAvailable(): Promise<boolean> {
    return this.llmProvider ? this.llmProvider.isAvailable() : false;
  }

  protected async callMcp(toolName: string, args: Record<string, unknown>): Promise<string> {
    return this.mcpBridge.callTool(toolName, args, TOOL_CALL_TIMEOUT_MS);
  }

  protected callDynamicTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    return callDynamicTool(toolName, args, this.mcpBridge);
  }

  protected async discoverTools(query: string, threshold = 0.4, topK = 5): Promise<string> {
    try { return await this.callMcp("find_tools", { query, threshold, top_k: topK }); }
    catch { return ""; }
  }

  // === Workspace Delegates ===
  protected readWorkspaceFile(p: string) { return readWorkspaceFile(p); }
  protected writeWorkspaceFile(p: string, c: string) {
    return writeWorkspaceFile(p, c, this.mcpBridge,
      () => firePreToolUseHooks("write"),
      (q: string) => this.callMcp("mem_search", { query: q, limit: 10 }),
      (fp: string) => fireFileHooks("fileCreated", fp, { ticketKey: "" } as PipelineState, this.nodeId, this.mcpBridge)
    );
  }
  protected appendWorkspaceFile(p: string, c: string) { return appendWorkspaceFile(p, c, this.mcpBridge); }
  protected exportDocx(md: string, name: string) { return exportDocx(md, name, this.mcpBridge); }
  protected exportDrawioPng(p: string) { return exportDrawioPng(p, this.mcpBridge); }
  protected getWorkspaceRoot() { return getWorkspaceRoot(); }
  protected readCodeIntelligence(m?: string) { return readCodeIntelligence(m); }

  // === Jira Delegates ===
  protected getJiraIssue(k: string) { return getJiraIssue(k, this.mcpBridge); }
  protected getJiraIssueFields(k: string, f: string) { return getJiraIssueFields(k, f, this.mcpBridge); }
  protected searchJira(jql: string) { return searchJira(jql, this.mcpBridge); }
  protected kbSearch(query: string, limit = 10, scope?: string) { return this.callMcp("mem_search", { query, limit, ...(scope ? { scope } : {}) }); }
  protected async kbIngest(content: string, type: string, source: string, tags: string[], scope: string = 'USER') {
    try { await this.callMcp("mem_ingest", { content, type, source, tags, scope }); } catch {}
  }
  protected async kbIngestFile(filePath: string, type = "DOCUMENT", scope: string = 'USER') {
    try { await this.callMcp("mem_ingest_file", { file_path: filePath, type, scope }); } catch {}
  }
  protected getJiraIssueRecursive(k: string, d = 2, m = 10) {
    return getJiraIssueRecursive(k, this.mcpBridge, d, m);
  }

  // === Hook & Shell Delegates ===
  protected firePreToolUseHooks(cat: string) { return firePreToolUseHooks(cat); }
  protected fireFileHooks(ev: "fileEdited" | "fileCreated", fp: string, s: PipelineState) {
    return fireFileHooks(ev, fp, s, this.nodeId, this.mcpBridge);
  }
  protected execShell(cmd: string, cwd?: string) { return execShell(cmd, cwd); }
  protected execGit(args: string) { return execGit(args); }

  // === Prompt & Workflow ===
  protected loadAgentPrompt(name: string, fallback: string) { return loadAgentPrompt(name, fallback); }
  protected async runAgentWorkflow(agentName: string, state: PipelineState, vars: Record<string, string> = {}) {
    const executor = new WorkflowExecutor(this as unknown as WorkflowNodeContext);
    return executor.run(agentName, state, vars);
  }

  // === Private ===
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Node '${this.nodeId}' timed out after ${ms}ms`)), ms);
      timer.unref?.();
      promise.then(v => { clearTimeout(timer); resolve(v); }).catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  private buildFailureState(state: PipelineState, error: Error, retryCount: number): Partial<PipelineState> {
    const pipelineError: PipelineError = {
      nodeId: this.nodeId, code: error.name || "NODE_FAILED",
      message: error.message, timestamp: new Date().toISOString(),
      recoverable: !(error instanceof NonRecoverableError),
    };
    this.streamHandler.emitError(this.nodeId, error.message, state.currentStreamId);
    return {
      errors: [...(state.errors || []), pipelineError],
      retryCount: { ...state.retryCount, [this.nodeId]: retryCount },
      pipelineStatus: "failed", lastUpdatedAt: new Date().toISOString(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
