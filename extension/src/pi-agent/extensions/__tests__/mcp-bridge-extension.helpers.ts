/**
 * Shared fixture for mcp-bridge-extension tests (split from mcp-bridge-extension.test.ts).
 * Test-side view of the built AgentTool (execute positional args match the handler).
 */
export type BuiltTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
  }>;
};
export const asTools = (tools: unknown): BuiltTool[] => tools as BuiltTool[];
