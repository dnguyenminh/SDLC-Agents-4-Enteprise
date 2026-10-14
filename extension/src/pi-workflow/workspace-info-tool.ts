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
import type { FunctionalMapSection } from './skeleton/skeleton-types.js';

export const WORKSPACE_INFO_TOOL_NAME = 'get_workspace_info';
const MAX_LIST_ENTRIES = 100;
const LAYOUT_CACHE_TTL_MS = 60_000;

/** SA4E-360 C-360-M2: cache value extended with the map section (hit.text unchanged). */
interface LayoutCacheEntry {
  at: number;
  text: string;
  map?: FunctionalMapSection;
}

const layoutCache = new Map<string, LayoutCacheEntry>();

/** Top-level layout snapshot for a workspace root (cached 60s, never throws). */
export function getWorkspaceLayoutText(workspaceRoot: string): string {
  return buildLayoutEntry(workspaceRoot).text;
}

/** Layout-only cache entry builder (shared by both read paths). */
function buildLayoutEntry(workspaceRoot: string): { at: number; text: string } {
  if (!workspaceRoot) return { at: Date.now(), text: 'Workspace root: (unknown)' };
  const hit = layoutCache.get(workspaceRoot);
  if (hit && Date.now() - hit.at < LAYOUT_CACHE_TTL_MS) return hit;
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
  const entry: LayoutCacheEntry = { at: Date.now(), text };
  layoutCache.set(workspaceRoot, entry);
  return entry;
}

/**
 * SA4E-360 (C-360-M2 AF-3) — shared sections function: layout + functional-map
 * section composed through the SAME 60s TTL window (one build serves the tool
 * result AND the session assembly path). Layout-only when no provider or when
 * the provider degrades (EF-2). Never throws.
 */
export function getWorkspaceSections(
  workspaceRoot: string,
  mapProvider?: { buildSection: (root: string, layoutText: string) => (FunctionalMapSection & { cacheTtlSeconds: number }) | undefined }
): { text: string; map?: FunctionalMapSection } {
  if (!mapProvider) return { text: getWorkspaceLayoutText(workspaceRoot) };
  const now = Date.now();
  const hit = layoutCache.get(workspaceRoot);
  if (hit && now - hit.at < LAYOUT_CACHE_TTL_MS) {
    if (hit.map || hit.map === null) return { text: hit.text, map: hit.map ?? undefined };
    const section = safeBuildSection(mapProvider, workspaceRoot, hit.text);
    const entry: LayoutCacheEntry = { at: hit.at, text: section ? section.text : hit.text, map: section ?? undefined };
    layoutCache.set(workspaceRoot, entry);
    return { text: entry.text, map: entry.map };
  }
  const layout = buildLayoutEntry(workspaceRoot);
  const section = safeBuildSection(mapProvider, workspaceRoot, layout.text);
  const entry: LayoutCacheEntry = { at: now, text: section ? section.text : layout.text, map: section ?? undefined };
  layoutCache.set(workspaceRoot, entry);
  return { text: entry.text, map: entry.map };
}

/** EF-2 guard: provider throws → layout only (provider also self-guards). */
function safeBuildSection(
  mapProvider: { buildSection: (root: string, layoutText: string) => (FunctionalMapSection & { cacheTtlSeconds: number }) | undefined },
  root: string,
  layoutText: string
): (FunctionalMapSection & { cacheTtlSeconds: number }) | undefined {
  try {
    return mapProvider.buildSection(root, layoutText);
  } catch (err) {
    debugLog(`[WorkspaceInfo] map build failed for ${root}: ${(err as Error).message}`);
    return undefined;
  }
}

/** Text-only variant (assembly path consumes the composed string). */
export function getWorkspaceSectionsText(workspaceRoot: string, mapProvider?: Parameters<typeof getWorkspaceSections>[1]): string {
  return getWorkspaceSections(workspaceRoot, mapProvider).text;
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

/** Zero-arg workspace orientation tool (legacy AgentTool shape).
 *  SA4E-360 (C-360-M1): optional map provider extends the result with the
 *  functional-map section; zero-arg schema and layout format UNCHANGED. */
export function createWorkspaceInfoTool(
  workspaceRoot: string,
  mapProvider?: Parameters<typeof getWorkspaceSections>[1]
): AgentTool {
  return {
    name: WORKSPACE_INFO_TOOL_NAME,
    label: 'Workspace info',
    description:
      'Get the workspace root path, top-level folder listing, and a functional-map section ' +
      '(module → summary → key symbols). Call FIRST for any exploration, review, or file task, ' +
      'and whenever a path does not exist.',
    parameters: Type.Object({}),
    execute: async () => {
      const { text, map } = getWorkspaceSections(workspaceRoot, mapProvider);
      const details = map
        ? { functionalMap: map.entries, mapTokens: map.mapTokens, cacheTtlSeconds: 60 }
        : {};
      return {
        content: [{ type: 'text' as const, text }],
        details,
      } as unknown as AgentToolResult<unknown>;
    },
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
