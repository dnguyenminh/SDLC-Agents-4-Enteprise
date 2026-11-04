/**
 * Pi Extension for registering custom tools via MCP Wrapper bridge
 * SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)
 * SEC-324-03: allowlist + deny dynamic chaining by default + approval + audit.
 */

import type { IServerManager } from "../../types/server-types";
import { McpBridge } from "../../mcp/mcp-bridge";
import type { AgentTool } from '@earendil-works/pi-agent-core';
import {
  DYNAMIC_TOOL_NAME,
  TOOLS,
  isDiscoveryTool,
} from './tool-definitions';
import { createExecuteHandler, bridgeRequiresApproval, defaultAuditLog } from './bridge-execute-handler';

// Approval policy + execute handler extracted to bridge-execute-handler.ts
// (BR-18) — re-exported so public symbols stay at this path.
export { createExecuteHandler, bridgeRequiresApproval } from './bridge-execute-handler';

interface PiExtensionAPI {
  registerTool: (definition: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (id: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; details?: Record<string, unknown> }>;
  }) => void;
}

interface PiExtensionContext {
  pi: PiExtensionAPI;
}

/** SEC-324-03: opt-in gate for `execute_dynamic_tool` chaining. */
export interface BridgeOptions {
  /** REQUIRED: server manager for the McpBridge transport (fail-closed, no URL fallback). */
  serverManager: IServerManager;
  /** When true, the dynamic-chaining tool is registered and callable. */
  allowDynamicChaining?: boolean;
  /** Approval hook for tools needing consent; deny when it resolves false. */
  approvalHook?: (toolName: string, params: Record<string, unknown>) => boolean | Promise<boolean>;
  /** Audit sink for every bridge invocation decision. */
  auditLog?: (entry: BridgeAuditEntry) => void;
}

export interface BridgeAuditEntry {
  toolName: string;
  argKeys: string[];
  decision: "auto-approved" | "approved" | "denied";
}

/**
 * SA4E-367: options for the pure tool builder below. The wiring paths pass an
 * already-constructed McpBridge, so no `serverManager` is required here —
 * fail-closed construction stays with the entry point / adapter (SEC-332-09).
 * SEC-324-03: `allowDynamicChaining` has no settings source (OI-04) — wiring
 * never passes it, so the discovery pair stays out of the tool schema.
 */
export type BridgeToolOptions = Pick<
  BridgeOptions,
  'allowDynamicChaining' | 'approvalHook' | 'auditLog'
>;

/**
 * Pi Extension entry point
 * Registers custom tools that proxy to MCP wrapper server
 */
export default function mcpBridgeExtension({ pi }: PiExtensionContext, options: BridgeOptions) {
  // SEC-332-09: fail-closed — no hardcoded-URL fallback (legacy factory deleted).
  if (!options?.serverManager) {
    throw new Error("[Security] McpBridge requires IServerManager (no hardcoded fallback)");
  }
  const bridge = new McpBridge(options.serverManager);
  const registeredTools = new Set<string>();

  for (const tool of TOOLS) {
    // Business Rule BR-1: Tool name must be unique within session
    if (registeredTools.has(tool.name)) {
      console.warn(`[Pi Extension] Tool name already exists: ${tool.name}`);
      continue;
    }
    // SEC-324-03: skip dynamic chaining unless explicitly opted in.
    if (tool.name === DYNAMIC_TOOL_NAME && options?.allowDynamicChaining !== true) {
      console.info(`[Pi Extension] Skipped dynamic tool (opt-in required): ${tool.name}`);
      continue;
    }

    try {
      pi.registerTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        execute: createExecuteHandler(bridge, tool.name, tool.parameters, options),
      });

      registeredTools.add(tool.name);
      console.info(`[Pi Extension] Registered tool: ${tool.name}`);
    } catch (err) {
      console.error(`[Pi Extension] Failed to register tool ${tool.name}:`, err);
    }
  }
}

/**
 * SA4E-364: pure builder — maps the static TOOLS catalog to pi-agent-core
 * AgentTool[] for the chat tool pool (legacy + session wiring share it).
 * Reuses the single source of truth (TOOLS / validateParams / allowlist /
 * DYNAMIC_TOOL_NAME / handler / audit) — no duplicated allowlist (BR-01).
 * Sync, no network, O(TOOLS) (NFR N-6). Never throws on normal wiring.
 *
 * SA4E-367: the skip-guard extends from the single dynamic tool to the
 * discovery pair (find_tools + execute_dynamic_tool travel together —
 * isDiscoveryTool covers both; SEC-324-03 deny-by-default).
 */
export function buildMcpBridgeAgentTools(
  bridge: McpBridge,
  options?: BridgeToolOptions
): AgentTool[] {
  const audit = options?.auditLog ?? defaultAuditLog;
  const out: AgentTool[] = [];
  const seen = new Set<string>(); // BR-1: tool names unique within a session
  for (const tool of TOOLS) {
    if (seen.has(tool.name)) {
      console.warn(`[Pi Extension] Tool name already exists: ${tool.name}`);
      continue;
    }
    // SEC-324-03: emit the discovery pair only on an explicit opt-in (=== true).
    if (isDiscoveryTool(tool.name) && options?.allowDynamicChaining !== true) continue;
    out.push({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      // Pick<> subset is structurally read by the handler (only the three
      // BridgeToolOptions fields are accessed inside createExecuteHandler).
      execute: createExecuteHandler(
        bridge,
        tool.name,
        tool.parameters,
        { ...options, audit } as unknown as BridgeOptions,
      ),
    } as unknown as AgentTool);
    seen.add(tool.name);
  }
  return out;
}

/**
 * SA4E-391 (MCP live tools): fetch the RUNNING server's `tools/list` and map
 * EVERY tool into a directly-callable AgentTool. The static `buildMcpBridgeAgentTools`
 * above only exposes a frozen 6-tool catalog, so the agent never saw the server's
 * real tools (drawio_*, get_curated_context, mem_graph, find_tools, …) even when
 * the sidebar showed "Connected". This builder closes that gap by exposing the
 * live catalog directly — no `execute_dynamic_tool` two-step needed.
 *
 * Each live tool executes via `bridge.callTool(name, args)` (same transport +
 * timeout + base64 interception as the static path). The server's `inputSchema`
 * becomes the tool parameters so the model calls them with correct arguments.
 *
 * Fail-safe: if the server is down / `listTools` throws, returns [] and the
 * caller falls back to the static concrete tools (degraded, never crashes).
 * Approval policy still applies at call time via the shared execute handler.
 */
export async function buildMcpBridgeAgentToolsLive(
  bridge: McpBridge,
  options?: BridgeToolOptions,
): Promise<AgentTool[]> {
  let defs: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = [];
  try {
    defs = await bridge.listTools();
  } catch (err) {
    console.warn(`[Pi Extension] live tools/list failed — falling back to static catalog: ${(err as Error).message}`);
    return [];
  }

  const audit = options?.auditLog ?? defaultAuditLog;
  const out: AgentTool[] = [];
  const seen = new Set<string>(); // BR-1: tool names unique within a session
  for (const def of defs) {
    if (!def || typeof def.name !== "string" || !def.name) continue;
    if (seen.has(def.name)) continue;
    // Default to an object schema when the server omits one so the SDK accepts
    // the tool and the model can pass free-form arguments.
    const parameters = (def.inputSchema && typeof def.inputSchema === "object")
      ? def.inputSchema
      : { type: "object", properties: {} };
    out.push({
      name: def.name,
      label: def.name,
      description: def.description || def.name,
      parameters,
      execute: createExecuteHandler(
        bridge,
        def.name,
        parameters,
        { ...options, audit } as unknown as BridgeOptions,
      ),
    } as unknown as AgentTool);
    seen.add(def.name);
  }
  return out;
}

/**
 * Export for testing
 */
export { TOOLS };
