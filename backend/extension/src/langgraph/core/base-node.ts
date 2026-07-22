/**
 * BaseNode — KSA-210 + KSA-233 + KSA-242
 * Abstract base class for all LangGraph pipeline nodes.
 * Core execution: timeout, retry loop, error handling, streaming, LLM wrappers.
 * Workspace utilities delegated to extracted modules.
 */

import * as fs from "fs";
import * as path from "path";
import { McpBridge } from "./mcp-bridge";
import { StreamHandler } from "./stream-handler";
import { PipelineState, PipelineError } from "./state";
import { NonRecoverableError } from "../errors/non-recoverable-error";
import type { LlmProvider, LlmMessage, LlmOptions } from "./llm-provider";
import { WorkflowExecutor, type WorkflowNodeContext } from "../workflow/workflow-executor";
import {
  readWorkspaceFile, writeWorkspaceFile, appendWorkspaceFile,
  exportDocx, exportDrawioPng, getWorkspaceRoot, readCodeIntelligence,
} from "../helpers/workspace-file-ops";
import {
  fireAgentStopHooks, firePreToolUseHooks, fireFileHooks,
  execShell, execGit,
} from "../helpers/hook-helpers";
import { estimateTokens } from "./context-budget";
import { loadSteeringRules, injectSteering } from "../steering/steering-loader";

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
    return this.mcpBridge.callTool("execute_dynamic_tool", {
      tool_name: toolName, arguments: args,
    }, TOOL_CALL_TIMEOUT_MS);
  }

  protected async discoverTools(query: string, threshold = 0.4, topK = 5): Promise<string> {
    try {
      const res = await this.callMcp("find_tools", { query, threshold, top_k: topK });
      try {
        const tools = JSON.parse(res);
        if (Array.isArray(tools)) {
          tools.forEach(tool => {
            if (tool.inputSchema?.properties) {
              const props = tool.inputSchema.properties;
              for (const key of Object.keys(props)) {
                if (key.includes("base64")) {
                  const newKey = `${key}_as_path`;
                  props[newKey] = { 
                    type: "string", 
                    description: "Absolute path to the local file (Proxy will convert to base64 automatically)" 
                  };
                  delete props[key];
                  if (Array.isArray(tool.inputSchema.required)) {
                    const idx = tool.inputSchema.required.indexOf(key);
                    if (idx !== -1) { tool.inputSchema.required[idx] = newKey; }
                  }
                }
              }
            }
          });
          return JSON.stringify(tools);
        }
      } catch (parseErr) {
        // JSON parse failed for tool list — return raw response as-is
        console.warn(`[BaseNode:${this.nodeId}] discoverTools parse error: ${(parseErr as Error).message}`);
      }
      return res;
    }
    catch (err) {
      console.warn(`[BaseNode:${this.nodeId}] discoverTools failed: ${(err as Error).message}`);
      return "";
    }
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

  // === Knowledge Base Delegates ===
  protected kbSearch(query: string, limit = 10, scope?: string) { return this.callMcp("mem_search", { query, limit, ...(scope ? { scope } : {}) }); }
  protected async kbIngest(content: string, type: string, source: string, tags: string[], scope: string = 'USER') {
    try { await this.callMcp("mem_ingest", { content, type, source, tags, scope }); } catch (err) {
      console.warn(`[BaseNode:${this.nodeId}] kbIngest failed (non-fatal): ${(err as Error).message}`);
    }
  }
  protected async kbIngestFile(filePath: string, type = "DOCUMENT", scope: string = 'USER') {
    try { await this.callMcp("mem_ingest_file", { file_path: filePath, type, scope }); } catch (err) {
      console.warn(`[BaseNode:${this.nodeId}] kbIngestFile failed (non-fatal): ${(err as Error).message}`);
    }
  }

  // === Hook & Shell Delegates ===
  protected firePreToolUseHooks(cat: string) { return firePreToolUseHooks(cat); }
  protected fireFileHooks(ev: "fileEdited" | "fileCreated", fp: string, s: PipelineState) {
    return fireFileHooks(ev, fp, s, this.nodeId, this.mcpBridge);
  }
  protected execShell(cmd: string, cwd?: string) { return execShell(cmd, cwd); }
  protected execGit(args: string) { return execGit(args); }

  // === Prompt & Workflow ===
  protected loadAgentPrompt(name: string, fallback: string): string {
    const wsRoot = this.getWorkspaceRoot();
    if (wsRoot) {
      const filePath = path.join(wsRoot, ".kiro", "agents", `${name}.md`);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const match = raw.match(/^---\n[\s\S]*?\n---\n*/);
        return match ? raw.slice(match[0].length).trim() : raw.trim();
      } catch (err) {
        console.debug(`[BaseNode] stripFrontMatter parse failed (non-fatal): ${(err as Error).message}`);
        return fallback;
      }
    }
    return fallback;
  }

  /**
   * Load agent system prompt with automatic steering rule injection.
   * Detects workspace root and merges steering rules into the prompt.
   */
  protected async loadSystemPromptWithSteering(agentName: string, fallback: string): Promise<string> {
    let prompt = await this.loadAgentPrompt(agentName, fallback);
    const wsRoot = this.getWorkspaceRoot();
    if (wsRoot) {
      const rules = await loadSteeringRules(wsRoot, "langgraph");
      prompt = injectSteering(prompt, rules);
    }
    return prompt;
  }

  /**
   * Build a context-safe prompt by estimating token usage and truncating
   * lower-priority sections to fit within the available budget.
   * Always keeps the first section (template/instruction) intact.
   */
  protected buildContextSafePrompt(
    sections: Array<{ title: string; content: string }>,
    contextBudget?: number
  ): string {
    if (!contextBudget || contextBudget <= 0) {
      // No budget set — join all sections as-is
      return sections.map(s => `\n## ${s.title}\n\n${s.content}`).join("\n");
    }

    const RESERVE_FOR_OUTPUT = 2000;
    const availableBudget = Math.max(500, contextBudget - RESERVE_FOR_OUTPUT);

    const resultParts: string[] = [];
    let usedTokens = 0;

    for (let i = 0; i < sections.length; i++) {
      const sectionText = `\n## ${sections[i].title}\n\n${sections[i].content}`;
      const sectionTokens = estimateTokens(sectionText);

      if (i === 0) {
        // Always include the first section (main instruction / template)
        resultParts.push(sectionText);
        usedTokens += sectionTokens;
      } else if (usedTokens + sectionTokens <= availableBudget) {
        // Section fits — include it
        resultParts.push(sectionText);
        usedTokens += sectionTokens;
      } else if (resultParts.length > 1) {
        // Section doesn't fit and we already have context beyond the first section
        // Estimate how many chars we can still include
        const remainingChars = Math.max(100, (availableBudget - usedTokens) * 3.5);
        const truncated = sections[i].content.length > remainingChars
          ? sections[i].content.slice(0, Math.floor(remainingChars)) + "\n[... truncated for context budget ...]"
          : sections[i].content;
        resultParts.push(`\n## ${sections[i].title}\n\n${truncated}`);
        break; // Stop after first truncation
      } else {
        // Only first section fits — include a hint that more context was available
        resultParts.push(`\n## Additional Context\n\n[${sections.length - 1} additional sections omitted due to context budget]`);
        break;
      }
    }

    return resultParts.join("\n");
  }

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

