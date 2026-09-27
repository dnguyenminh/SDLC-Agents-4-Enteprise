/**
 * Pi Extension for registering custom tools via MCP Wrapper bridge
 * SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)
 * SEC-324-03: allowlist + deny dynamic chaining by default + approval + audit.
 */

import { requiresApproval } from "../../chat/engine/ToolApprovalClassifier";
import { createMcpClient, McpWrapperClient } from './mcp-wrapper-client';
import {
  DYNAMIC_TOOL_NAME,
  TOOLS,
  TOOL_ALLOWLIST,
  validateParams,
} from './tool-definitions';

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

/** Default audit sink: structured console line (never logs param values). */
function defaultAuditLog(entry: BridgeAuditEntry): void {
  console.info(`[Pi Extension] bridge call ${JSON.stringify(entry)}`);
}

/** SEC-324-03: bridge-side approval policy for a tool name. */
export function bridgeRequiresApproval(toolName: string): boolean {
  if (toolName === DYNAMIC_TOOL_NAME || toolName === "mem_ingest") return true;
  return requiresApproval(toolName);
}

/** Deny message for blocked dynamic-chaining calls. */
function chainingDenied(toolName: string) {
  return {
    content: [{ type: 'text' as const, text: `Dynamic tool chaining is disabled: ${toolName} requires explicit opt-in` }],
    details: { error: 'chaining_denied', toolName },
  };
}

/** Check the inner tool target of an allowed dynamic-chaining call. */
function validateChainedTarget(params: Record<string, unknown>) {
  const inner = params.tool_name;
  if (typeof inner !== "string" || !TOOL_ALLOWLIST.has(inner)) {
    return {
      content: [{ type: 'text' as const, text: `Dynamic tool chaining denied: '${String(inner)}' is not allowlisted` }],
      details: { error: 'chaining_denied', toolName: DYNAMIC_TOOL_NAME, target: String(inner) },
    };
  }
  return null;
}

/** Run the approval hook when the tool needs consent; null = approved. */
async function checkApproval(
  toolName: string,
  params: Record<string, unknown>,
  options?: BridgeOptions,
): Promise<{ approved: boolean; decision: BridgeAuditEntry["decision"] }> {
  if (!bridgeRequiresApproval(toolName)) return { approved: true, decision: "auto-approved" };
  if (!options?.approvalHook) return { approved: true, decision: "auto-approved" };
  const ok = await options.approvalHook(toolName, params);
  return ok ? { approved: true, decision: "approved" } : { approved: false, decision: "denied" };
}

/**
 * Create execute handler that proxies to MCP wrapper with validation and error handling
 */
function createExecuteHandler(
  mcpClient: McpWrapperClient,
  toolName: string,
  parametersSchema: unknown,
  options?: BridgeOptions,
) {
  return async (id: string, params: Record<string, unknown>) => {
    const audit = options?.auditLog ?? defaultAuditLog;
    // SEC-324-03: deny execute_dynamic_tool chaining by default (opt-in only).
    if (toolName === DYNAMIC_TOOL_NAME && options?.allowDynamicChaining !== true) {
      audit({ toolName, argKeys: [], decision: "denied" });
      return chainingDenied(toolName);
    }
    // Validate parameters before execution
    const validation = validateParams(parametersSchema as any, params);
    if (!validation.valid) {
      return {
        content: [{ type: 'text' as const, text: `Validation failed: ${validation.error}` }],
        details: { error: 'validation', toolName },
      };
    }
    // Even when opted in, the chained target must be allowlisted.
    if (toolName === DYNAMIC_TOOL_NAME) {
      const denied = validateChainedTarget(params);
      if (denied) {
        audit({ toolName, argKeys: Object.keys(params), decision: "denied" });
        return denied;
      }
    }
    // SEC-324-03: route through approval, then audit every invocation.
    const { approved, decision } = await checkApproval(toolName, params, options);
    audit({ toolName, argKeys: Object.keys(params), decision });
    if (!approved) {
      return {
        content: [{ type: 'text' as const, text: `Tool call denied by approval: ${toolName}` }],
        details: { error: 'approval_denied', toolName },
      };
    }

    try {
      const result = await mcpClient.callMcpWrapper(toolName, params);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return {
        content: [{ type: 'text' as const, text }],
        details: { toolName, success: true },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      // Propagate error clearly, do not swallow
      return {
        content: [{ type: 'text' as const, text: `Error invoking ${toolName}: ${errorMessage}` }],
        details: { error: 'mcp_error', toolName, cause: errorMessage },
      };
    }
  };
}

/**
 * Pi Extension entry point
 * Registers custom tools that proxy to MCP wrapper server
 */
export default function mcpBridgeExtension({ pi }: PiExtensionContext, options?: BridgeOptions) {
  const mcpClient = createMcpClient();
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
        execute: createExecuteHandler(mcpClient, tool.name, tool.parameters, options),
      });

      registeredTools.add(tool.name);
      console.info(`[Pi Extension] Registered tool: ${tool.name}`);
    } catch (err) {
      console.error(`[Pi Extension] Failed to register tool ${tool.name}:`, err);
    }
  }
}

/**
 * Export for testing
 */
export { createExecuteHandler, TOOLS };
