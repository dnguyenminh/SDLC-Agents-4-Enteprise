/**
 * Shared kernel tool types — SA4E-332.
 * Single canonical owner of McpToolDefinition (FSD TA-11.5, TDD Section 5.2).
 * Every consumer (McpBridge, LlmProvider, providers, ToolRegistry) imports
 * the TYPE from here so the kernel never depends on the frozen legacy tree.
 */

/** Raw MCP tool definition from tools/list response */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
