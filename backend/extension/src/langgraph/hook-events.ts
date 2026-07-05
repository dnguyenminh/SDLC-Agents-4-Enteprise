/**
 * HookEventsManager — KSA-249
 * Central event dispatcher with circular dependency detection.
 * Matches hooks by event type and tool category, fires them via HookExecutor.
 */

import * as vscode from "vscode";
import { HookDefinition, loadHooks, filterHooksByType } from "./hook-loader";
import { HookExecutor, HookContext, HookResult } from "./hook-executor";

export type HookEventType = HookDefinition["when"]["type"];

export interface PreToolUseResult {
  denied: boolean;
  hookName?: string;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}

interface HookLogEntry {
  hookName: string;
  eventType: HookEventType;
  timestamp: number;
  result: HookResult["status"];
  duration: number;
}

/** Tool category classification map */
const TOOL_CATEGORIES: Record<string, string> = {
  readFile: "read",
  read_file: "read",
  read_code: "read",
  read_files: "read",
  grep_search: "read",
  file_search: "read",
  list_directory: "read",
  get_diagnostics: "spec",
  get_process_output: "spec",
  fs_write: "write",
  str_replace: "write",
  fs_append: "write",
  delete_file: "write",
  execute_pwsh: "shell",
  control_pwsh_process: "shell",
  web_search: "web",
  fetch_url: "web",
};

export class HookEventsManager {
  private executionStack: Set<string> = new Set();
  private executionLog: HookLogEntry[] = [];
  private maxDepth: number;
  private executor: HookExecutor;
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel, maxDepth = 3) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.maxDepth = maxDepth;
    this.executor = new HookExecutor(outputChannel);
  }

  /**
   * Fire event for a given type. Finds matching hooks and executes them.
   */
  async fireEvent(eventType: HookEventType, context: HookContext): Promise<void> {
    const hooks = await loadHooks(this.workspaceRoot);
    const matching = filterHooksByType(hooks, eventType);

    for (const hook of matching) {
      if (this.isCircular(hook.name)) {
        this.outputChannel.appendLine(`[WARN] Circular hook skipped: "${hook.name}"`);
        continue;
      }
      await this.executeHook(hook, context);
    }
  }

  /**
   * Fire preToolUse event. Returns denial info if any hook denies the tool call.
   */
  async firePreToolUse(toolName: string, args: Record<string, unknown>): Promise<PreToolUseResult> {
    const hooks = await loadHooks(this.workspaceRoot);
    const category = this.classifyTool(toolName);
    const matching = this.getMatchingToolHooks(hooks, "preToolUse", toolName, category);
    const context: HookContext = { toolName, toolArgs: args };

    for (const hook of matching) {
      if (this.isCircular(hook.name)) {
        this.outputChannel.appendLine(`[WARN] Circular preToolUse skipped: "${hook.name}"`);
        continue;
      }
      const result = await this.executeHook(hook, context);
      if (result.status === "denied") {
        return { denied: true, hookName: hook.name, reason: result.error };
      }
    }

    return { denied: false };
  }

  /**
   * Fire postToolUse event. Matches by tool category and regex patterns.
   */
  async firePostToolUse(toolName: string, args: Record<string, unknown>, result: string): Promise<void> {
    const hooks = await loadHooks(this.workspaceRoot);
    const category = this.classifyTool(toolName);
    const matching = this.getMatchingToolHooks(hooks, "postToolUse", toolName, category);
    const context: HookContext = { toolName, toolArgs: args, toolResult: result };

    for (const hook of matching) {
      if (this.isCircular(hook.name)) continue;
      await this.executeHook(hook, context);
    }
  }

  /**
   * Execute a single hook with circular detection tracking.
   */
  private async executeHook(hook: HookDefinition, context: HookContext): Promise<HookResult> {
    this.executionStack.add(hook.name);
    const result = await this.executor.execute(hook, context);
    this.executionStack.delete(hook.name);

    this.executionLog.push({
      hookName: hook.name,
      eventType: hook.when.type,
      timestamp: Date.now(),
      result: result.status,
      duration: result.duration,
    });

    if (this.executionLog.length > 200) {
      this.executionLog = this.executionLog.slice(-100);
    }

    return result;
  }

  /**
   * Check if executing this hook would create a circular dependency.
   */
  private isCircular(hookName: string): boolean {
    if (this.executionStack.has(hookName)) return true;
    return this.executionStack.size >= this.maxDepth;
  }

  /**
   * Classify a tool name into a category.
   */
  classifyTool(toolName: string): string {
    return TOOL_CATEGORIES[toolName] || "other";
  }

  /**
   * Get hooks matching a tool event type (pre/post) and tool name/category.
   */
  private getMatchingToolHooks(
    hooks: HookDefinition[],
    eventType: "preToolUse" | "postToolUse",
    toolName: string,
    category: string
  ): HookDefinition[] {
    return hooks.filter(h => {
      if (h.when.type !== eventType) return false;
      return this.matchesToolType(h, toolName, category);
    });
  }

  /**
   * Check if a hook's toolTypes match the given tool name or category.
   * Supports: exact category, "*" wildcard, regex patterns.
   */
  private matchesToolType(hook: HookDefinition, toolName: string, category: string): boolean {
    const toolTypes = hook.when.toolTypes;
    if (!toolTypes || toolTypes.length === 0) return true;

    return toolTypes.some(pattern => {
      if (pattern === "*") return true;
      if (pattern === category) return true;
      if (pattern === toolName) return true;
      try {
        return new RegExp(pattern).test(toolName);
      } catch {
        return false;
      }
    });
  }

  /** Get recent execution log entries. */
  getExecutionLog(limit = 50): HookLogEntry[] {
    return this.executionLog.slice(-limit);
  }
}
