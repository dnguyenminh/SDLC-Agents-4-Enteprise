/**
 * Pi Extension for registering custom tools via MCP Wrapper bridge
 * SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)
 */

import { createMcpClient, McpWrapperClient } from './mcp-wrapper-client';
import { TOOLS, validateParams } from './tool-definitions';

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

/**
 * Create execute handler that proxies to MCP wrapper with validation and error handling
 */
function createExecuteHandler(mcpClient: McpWrapperClient, toolName: string, parametersSchema: unknown) {
  return async (id: string, params: Record<string, unknown>) => {
    // Validate parameters before execution
    const validation = validateParams(parametersSchema as any, params);
    if (!validation.valid) {
      return {
        content: [{ type: 'text' as const, text: `Validation failed: ${validation.error}` }],
        details: { error: 'validation', toolName },
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
export default function mcpBridgeExtension({ pi }: PiExtensionContext) {
  const mcpClient = createMcpClient();
  const registeredTools = new Set<string>();

  for (const tool of TOOLS) {
    // Business Rule BR-1: Tool name must be unique within session
    if (registeredTools.has(tool.name)) {
      console.warn(`[Pi Extension] Tool name already exists: ${tool.name}`);
      continue;
    }

    try {
      pi.registerTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        execute: createExecuteHandler(mcpClient, tool.name, tool.parameters),
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
