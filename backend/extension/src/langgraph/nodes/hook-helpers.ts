/**
 * Hook Helpers — extracted from BaseNode (KSA-242)
 * Dynamic hook execution for pipeline nodes: agentStop, preToolUse, file hooks.
 */

import { debugError } from "../../debug-logger";
import type { McpBridge } from "../mcp-bridge";
import type { PipelineState } from "../state";
import {
  loadHooks, filterHooksByType, filterPreToolUseHooks, filterFileHooks,
  type HookDefinition,
} from "../hook-loader";
import { getWorkspaceRoot } from "./workspace-file-ops";

const TOOL_CALL_TIMEOUT_MS = 60_000;

async function getHooks(): Promise<HookDefinition[]> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return [];
  return loadHooks(workspaceRoot);
}

export async function fireAgentStopHooks(
  nodeId: string, state: PipelineState, output: string, mcpBridge: McpBridge
): Promise<void> {
  try {
    const hooks = await getHooks();
    const matching = filterHooksByType(hooks, "agentStop");
    for (const hook of matching) {
      await executeHookAction(hook, state, output, nodeId, mcpBridge);
    }
  } catch (err) {
    debugError(`[HookHelpers] agentStop hook failed for ${nodeId}`, err as Error);
  }
}

export async function firePreToolUseHooks(toolCategory: string): Promise<string[]> {
  try {
    const hooks = await getHooks();
    const matching = filterPreToolUseHooks(hooks, toolCategory);
    return matching
      .filter(h => h.then.type === "askAgent" && h.then.prompt)
      .map(h => h.then.prompt!);
  } catch (err) {
    debugError(`[HookHelpers] preToolUse hook failed for ${toolCategory}`, err as Error);
    return [];
  }
}

export async function fireFileHooks(
  eventType: "fileEdited" | "fileCreated",
  filePath: string,
  state: PipelineState,
  nodeId: string,
  mcpBridge: McpBridge
): Promise<void> {
  try {
    const hooks = await getHooks();
    const matching = filterFileHooks(hooks, eventType, filePath);
    for (const hook of matching) {
      await executeHookAction(hook, state, "", nodeId, mcpBridge, filePath);
    }
  } catch (err) {
    debugError(`[HookHelpers] file hook failed for ${eventType} on ${filePath}`, err as Error);
  }
}

async function executeHookAction(
  hook: HookDefinition,
  state: PipelineState,
  contextContent: string,
  nodeId: string,
  mcpBridge: McpBridge,
  filePath?: string
): Promise<void> {
  try {
    if (hook.then.type === "runCommand" && hook.then.command) {
      const command = filePath
        ? hook.then.command.replace("${file}", filePath)
        : hook.then.command;
      await execShell(command);
    } else if (hook.then.type === "askAgent" && hook.then.prompt) {
      if (hook.then.prompt.includes("mem_ingest")) {
        const summary = contextContent.slice(0, 150);
        await mcpBridge.callTool("mem_ingest", {
          content: summary, type: "CONTEXT",
          source: `hook-${hook.name.toLowerCase().replace(/\s+/g, "-")}`,
          tags: ["hook", nodeId, state.ticketKey],
          scope: "USER",
        }, TOOL_CALL_TIMEOUT_MS);
      } else if (hook.then.prompt.includes("mem_search") && hook.then.prompt.includes("drawio")) {
        await mcpBridge.callTool("mem_search", {
          query: "drawio procedure styles edges containers", limit: 10,
        }, TOOL_CALL_TIMEOUT_MS);
      }
    }
  } catch (err) {
    debugError(`[HookHelpers] hook action failed for ${hook.name}`, err as Error);
  }
}

export async function execShell(command: string, cwd?: string): Promise<string> {
  const { exec } = require("child_process");
  const workspaceRoot = getWorkspaceRoot();
  const execCwd = cwd || workspaceRoot || process.cwd();

  return new Promise<string>((resolve, reject) => {
    const child = exec(
      command,
      { cwd: execCwd, maxBuffer: 10 * 1024 * 1024, timeout: TOOL_CALL_TIMEOUT_MS },
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) reject(new Error(`Shell failed: ${command}\n${stderr || error.message}`));
        else resolve(stdout.trim());
      }
    );
    child.unref?.();
  });
}

export async function execGit(args: string): Promise<string> {
  return execShell(`git ${args}`);
}
