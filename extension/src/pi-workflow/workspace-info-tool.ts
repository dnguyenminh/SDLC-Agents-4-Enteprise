/**
 * Workspace info tool + not-found hint wrapper.
 * Replaces regex intent-guessing (UAT: adding more WORDS is whack-a-mole)
 * with deterministic mechanisms:
 * 1. `get_workspace_info` — zero-arg tool any model can call to learn the
 *    real root + layout instead of hallucinating nested paths.
 * 2. Path tools (read/ls/find/grep/edit) re-throw not-found errors enriched
 *    with the real layout, so the NEXT call self-corrects without new UI.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Type } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { debugLog } from '../debug-logger';

export const WORKSPACE_INFO_TOOL_NAME = 'get_workspace_info';
const MAX_LIST_ENTRIES = 100;
const LAYOUT_CACHE_TTL_MS = 60_000;

const layoutCache = new Map<string, { at: number; text: string }>();

/** Top-level layout snapshot for a workspace root (cached 60s, never throws). */
export function getWorkspaceLayoutText(workspaceRoot: string): string {
  if (!workspaceRoot) return 'Workspace root: (unknown)';
  const hit = layoutCache.get(workspaceRoot);
  if (hit && Date.now() - hit.at < LAYOUT_CACHE_TTL_MS) return hit.text;
  let text = `Workspace root: ${workspaceRoot}`;
  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    const lines = entries.slice(0, MAX_LIST_ENTRIES).map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    if (entries.length > MAX_LIST_ENTRIES) {
      lines.push(`... +${entries.length - MAX_LIST_ENTRIES} more`);
    }
    text += `\nTop-level entries:\n${lines.join('\n')}`;
  } catch (err) {
    debugLog(`[WorkspaceInfo] list failed for ${workspaceRoot}: ${(err as Error).message}`);
  }
  layoutCache.set(workspaceRoot, { at: Date.now(), text });
  return text;
}

/** Test hook. */
export function clearLayoutCache(): void {
  layoutCache.clear();
}

const NOT_FOUND_PATTERNS = /ENOENT|no such file|not found|does not exist|ENOTDIR|EISDIR/i;

/**
 * Wrap a path-taking tool so not-found failures come back with the real
 * layout attached. The model self-corrects on its next call — no regex,
 * no extra turn, no UI needed.
 */
export function withNotFoundHint<T extends AgentTool>(tool: T, workspaceRoot: string): T {
  const execute = tool.execute;
  const wrapped = async (
    toolCallId: string,
    params: never,
    signal?: AbortSignal,
    onUpdate?: never
  ): Promise<AgentToolResult<unknown>> => {
    try {
      return (await (execute as (...a: unknown[]) => Promise<AgentToolResult<unknown>>)(
        toolCallId,
        params,
        signal,
        onUpdate
      )) as AgentToolResult<unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (NOT_FOUND_PATTERNS.test(message)) {
        const hint =
          `${message}\n\n[HINT] That path does not exist. ${getWorkspaceLayoutText(workspaceRoot)}\n` +
          `Re-list from the workspace root instead of guessing deeper paths.`;
        throw err instanceof Error ? new Error(hint, { cause: err }) : new Error(hint);
      }
      throw err;
    }
  };
  return { ...tool, execute: wrapped as T['execute'] };
}

/** Zero-arg workspace orientation tool (legacy AgentTool shape). */
export function createWorkspaceInfoTool(workspaceRoot: string): AgentTool {
  return {
    name: WORKSPACE_INFO_TOOL_NAME,
    label: 'Workspace info',
    description:
      'Get the workspace root path and top-level folder listing. ' +
      'Call FIRST for any exploration, review, or file task, and whenever a path does not exist.',
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: 'text' as const, text: getWorkspaceLayoutText(workspaceRoot) }],
      details: {},
    }),
  } as unknown as AgentTool;
}

/** Session (AgentSession customTools) shape of the same tool. */
export function toSessionToolDefinition(
  tool: AgentTool
): import('@earendil-works/pi-coding-agent').ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: 'Workspace orientation',
    promptGuidelines: [
      'Call get_workspace_info first for exploration or review tasks.',
    ],
    execute: async (toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: never) =>
      tool.execute(
        toolCallId,
        params as never,
        signal,
        onUpdate as never
      ) as unknown as import('@earendil-works/pi-coding-agent').AgentToolResult<unknown>,
  } as unknown as import('@earendil-works/pi-coding-agent').ToolDefinition;
}
