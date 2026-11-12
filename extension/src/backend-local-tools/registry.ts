/**
 * Local tool registry — OCP-compliant handler/definition map.
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 * To add a new local tool: call registerLocalTool(name, handler, definition).
 */
import { handleStreamWriteFile } from "./stream-write";
import { handleEmbedImage } from "./embed-image";
import { streamWriteFileDefinition, embedImageDefinition } from "./definitions";
// SA4E-406 Extension Migration: drawio tools execute LOCALLY in the extension.
import { handleDrawioAutoLayout, DRAWIO_AUTO_LAYOUT_DEFINITION } from "../tools/drawio/drawio-tool";
import { handleDrawioExportPng, DRAWIO_EXPORT_PNG_DEFINITION } from "../tools/drawio/drawio-export-png";

/** Type for a local tool handler function. */
export type LocalToolHandler = (args: Record<string, unknown>, ctx?: ToolCallContext) => unknown;

/**
 * SA4E-406 A6 — per-request context threaded from the MCP session layer into
 * local tool handlers. `sessionRoot` is the root bound at MCP initialize
 * (already trust-admitted); handlers forward it into resolveWorkspacePath so
 * EVERY file_path tool resolves against the session root, not just one tool.
 */
export interface ToolCallContext {
  sessionRoot?: string;
}

/** Definition shape for a local tool (injected into tools/list). */
export interface LocalToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Hidden tools are executable + discoverable via find_tools but omitted from tools/list. */
  hidden?: boolean;
}

/** A registry entry couples a handler with its definition. */
interface LocalToolEntry {
  handler: LocalToolHandler;
  definition: LocalToolDefinition;
}

/**
 * Registry of local tool handlers — OCP compliant.
 * To add a new local tool: call registerLocalTool(name, handler, definition).
 */
const LOCAL_TOOL_REGISTRY: Map<string, LocalToolEntry> = new Map([
  ["stream_write_file", { handler: handleStreamWriteFile, definition: streamWriteFileDefinition() }],
  ["embed_image", { handler: handleEmbedImage, definition: embedImageDefinition() }],
  // SA4E-406 Extension Migration — local execution, no backend round-trip:
  ["drawio_auto_layout", { handler: handleDrawioAutoLayout, definition: DRAWIO_AUTO_LAYOUT_DEFINITION }],
  ["drawio_export_png", { handler: handleDrawioExportPng, definition: DRAWIO_EXPORT_PNG_DEFINITION }],
]);

/**
 * Register a new local tool handler + definition (OCP: no switch/case needed).
 */
export function registerLocalTool(
  name: string,
  handler: LocalToolHandler,
  definition: LocalToolDefinition,
): void {
  LOCAL_TOOL_REGISTRY.set(name, { handler, definition });
}

/** Whether a tool name is handled locally (no backend forwarding). */
export function isLocalTool(name: string): boolean {
  return LOCAL_TOOL_REGISTRY.has(name);
}

export async function executeLocalTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: ToolCallContext,
): Promise<unknown> {
  const entry = LOCAL_TOOL_REGISTRY.get(name);
  if (entry) return entry.handler(args, ctx);
  return { isError: true, content: [{ type: "text", text: `Local tool '${name}' not implemented.` }] };
}

/** Tool definitions for local tools, injected into tools/list responses. */
export function getLocalToolDefinitions(): LocalToolDefinition[] {
  return [...LOCAL_TOOL_REGISTRY.values()].map((e) => e.definition);
}

/**
 * Visible tool definitions for tools/list — excludes hidden tools.
 * Hidden tools stay discoverable via find_tools and callable via
 * execute_dynamic_tool, but do not clutter the LLM tool list.
 */
export function getVisibleLocalToolDefinitions(): LocalToolDefinition[] {
  return getLocalToolDefinitions().filter((d) => !d.hidden);
}

/**
 * Merge backend-listed tools with local definitions. Tools executed locally win:
 * a same-name backend entry is replaced so clients never see a stale duplicate.
 */
export function mergeLocalToolDefinitions<T extends { name?: string }>(backendTools: T[], localDefs: LocalToolDefinition[]): Array<T | LocalToolDefinition> {
  const local = new Map(localDefs.map((d) => [d.name, d]));
  const merged: Array<T | LocalToolDefinition> = backendTools.map((t) => (t?.name && local.has(t.name) ? local.get(t.name)! : t));
  const seen = new Set(backendTools.map((t) => t?.name));
  for (const d of localDefs) if (!seen.has(d.name)) merged.push(d);
  return merged;
}
