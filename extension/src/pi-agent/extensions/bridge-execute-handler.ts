/**
 * bridge-execute-handler — approval policy, audit, validation and the shared
 * execute handler for MCP-bridge tool calls. Extracted from
 * mcp-bridge-extension.ts (BR-18); SEC-324-03 policies unchanged.
 */
import { requiresApproval } from "../../chat/engine/ToolApprovalClassifier";
import { McpBridge } from "../../mcp/mcp-bridge";
import {
  DYNAMIC_TOOL_NAME,
  TOOL_ALLOWLIST,
  isDiscoveryTool,
  validateParams,
} from './tool-definitions';
import type { BridgeOptions, BridgeAuditEntry } from './mcp-bridge-extension';

/** Default audit sink: structured console line (never logs param values). */
export function defaultAuditLog(entry: BridgeAuditEntry): void {
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
export function createExecuteHandler(
  bridge: McpBridge,
  toolName: string,
  parametersSchema: unknown,
  options?: BridgeOptions,
) {
  return async (id: string, params: Record<string, unknown>) => {
    const audit = options?.auditLog ?? defaultAuditLog;
    // SEC-324-03: deny the discovery pair (find_tools + execute_dynamic_tool)
    // by default — callable only on the explicit opt-in (=== true).
    if (isDiscoveryTool(toolName) && options?.allowDynamicChaining !== true) {
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
      const result = await bridge.callTool(toolName, params);
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
