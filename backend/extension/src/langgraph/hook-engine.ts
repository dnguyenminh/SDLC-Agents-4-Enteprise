/**
 * HookEngine — KSA-280
 * Unified hook engine for the Chat Panel LangGraph pipeline.
 * Fires hooks at checkpoints (preToolUse, postToolUse, promptSubmit, agentStop).
 */

import { debugLog, debugError } from "../debug-logger";
import { StreamHandler } from "./stream-handler";
import { HookDefinition, loadHooks, clearHookCache, filterHooksByType } from "./hook-loader";
import { HookExecutor, HookContext, HookResult } from "./hook-executor";
import { classifyTool, getMatchingToolHooks, extractFilePath, matchGlob } from "./hook-tool-matcher";
import { emitHookFired } from "./hook-emitter";
import * as vscode from "vscode";

export interface PreToolUseHookResult {
  denied: boolean;
  hookName?: string;
  reason?: string;
  injectedPrompts: string[];
}

export interface PostToolUseHookResult {
  injectedPrompts: string[];
}

export class HookEngine {
  private hooks: HookDefinition[] = [];
  private loaded = false;
  private executionStack: Set<string> = new Set();
  private executor: HookExecutor;
  private outputChannel: vscode.OutputChannel;

  constructor(private readonly workspaceRoot: string) {
    this.outputChannel = vscode.window.createOutputChannel("Kiro Hooks Engine");
    this.executor = new HookExecutor(this.outputChannel, 60_000);
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    try {
      this.hooks = await loadHooks(this.workspaceRoot);
      this.loaded = true;
      debugLog(`[HookEngine] Initialized with ${this.hooks.length} hooks`);
    } catch (err) {
      debugError("[HookEngine] Failed to load hooks", err as Error);
      this.hooks = [];
      this.loaded = true;
    }
  }

  async reload(): Promise<void> {
    clearHookCache();
    this.loaded = false;
    await this.initialize();
  }

  async firePreToolUse(
    toolName: string, args: Record<string, unknown>, streamHandler: StreamHandler, streamId: string
  ): Promise<PreToolUseHookResult> {
    await this.initialize();
    const category = classifyTool(toolName);
    const matching = getMatchingToolHooks(this.hooks, "preToolUse", toolName, category);
    if (matching.length === 0) return { denied: false, injectedPrompts: [] };

    const injectedPrompts: string[] = [];
    const context: HookContext = { toolName, toolArgs: args };
    for (const hook of matching) {
      const result = await this.execSafe(hook, context, streamHandler, streamId, "preToolUse", toolName);
      if (!result) continue;
      if (result.status === "denied") {
        return { denied: true, hookName: hook.name, reason: result.error, injectedPrompts };
      }
      if (hook.then.type === "askAgent" && result.status === "completed" && result.output) {
        injectedPrompts.push(result.output);
      }
    }
    return { denied: false, injectedPrompts };
  }

  async firePostToolUse(
    toolName: string, args: Record<string, unknown>, toolResult: string,
    streamHandler: StreamHandler, streamId: string
  ): Promise<PostToolUseHookResult> {
    await this.initialize();
    const category = classifyTool(toolName);
    const injectedPrompts: string[] = [];
    const postHooks = getMatchingToolHooks(this.hooks, "postToolUse", toolName, category);
    const context: HookContext = { toolName, toolArgs: args, toolResult };

    for (const hook of postHooks) {
      const r = await this.execSafe(hook, context, streamHandler, streamId, "postToolUse", toolName);
      if (r && hook.then.type === "askAgent" && r.status === "completed" && r.output) injectedPrompts.push(r.output);
    }

    if (category === "write") {
      const filePath = extractFilePath(toolName, args);
      if (filePath) injectedPrompts.push(...await this.fireFileHooks(filePath, toolName, streamHandler, streamId));
    }
    return { injectedPrompts };
  }

  async firePromptSubmit(text: string, streamHandler: StreamHandler, streamId?: string): Promise<string[]> {
    await this.initialize();
    const matching = filterHooksByType(this.hooks, "promptSubmit");
    if (matching.length === 0) return [];
    const sid = streamId || `hook-prompt-${Date.now()}`;
    const prompts: string[] = [];
    for (const hook of matching) {
      const r = await this.execSafe(hook, { toolArgs: { text } }, streamHandler, sid, "promptSubmit", undefined);
      if (r && hook.then.type === "askAgent" && r.status === "completed" && r.output) prompts.push(r.output);
    }
    return prompts;
  }

  async fireAgentStop(streamHandler: StreamHandler, streamId?: string): Promise<string[]> {
    await this.initialize();
    const matching = filterHooksByType(this.hooks, "agentStop");
    if (matching.length === 0) return [];
    const sid = streamId || `hook-stop-${Date.now()}`;
    const prompts: string[] = [];
    for (const hook of matching) {
      const r = await this.execSafe(hook, {}, streamHandler, sid, "agentStop", undefined);
      if (r && hook.then.type === "askAgent" && r.status === "completed" && r.output) prompts.push(r.output);
    }
    return prompts;
  }

  getHookCount(): number { return this.hooks.length; }

  dispose(): void {
    this.outputChannel.dispose();
    this.hooks = [];
    this.loaded = false;
    this.executionStack.clear();
  }

  private async execSafe(
    hook: HookDefinition, context: HookContext, sh: StreamHandler,
    streamId: string, event: string, toolName: string | undefined
  ): Promise<HookResult | null> {
    if (this.executionStack.has(hook.name)) return null;
    this.executionStack.add(hook.name);
    const start = Date.now();
    try {
      const result = await this.executor.execute(hook, context);
      emitHookFired(sh, streamId, hook, event, toolName, result, Date.now() - start);
      return result;
    } catch (err) {
      debugError(`[HookEngine] ${event} hook "${hook.name}" error`, err as Error);
      return null;
    } finally {
      this.executionStack.delete(hook.name);
    }
  }

  private async fireFileHooks(filePath: string, toolName: string, sh: StreamHandler, streamId: string): Promise<string[]> {
    const eventType = (toolName === "fs_write" || toolName === "stream_write_file") ? "fileCreated" : "fileEdited";
    const matching = this.hooks.filter(h => {
      if (h.when.type !== eventType) return false;
      if (!h.when.patterns || h.when.patterns.length === 0) return true;
      return h.when.patterns.some(p => matchGlob(p, filePath));
    });
    const prompts: string[] = [];
    const context: HookContext = { toolName, toolArgs: { filePath }, toolResult: filePath };
    for (const hook of matching) {
      const r = await this.execSafe(hook, context, sh, streamId, eventType, filePath);
      if (r && hook.then.type === "askAgent" && r.status === "completed" && r.output) prompts.push(r.output);
    }
    return prompts;
  }
}
