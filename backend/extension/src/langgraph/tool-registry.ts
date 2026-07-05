/**
 * ToolRegistry — Fetches ALL tools from MCP server and caches them.
 * Provides tool definitions in LLM-compatible formats (Anthropic, OpenAI, Ollama).
 */

import { McpBridge } from "./mcp-bridge";

/** Raw MCP tool definition from tools/list response */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Anthropic tool format */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** OpenAI/Ollama function format */
export interface OpenAIFunction {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class ToolRegistry {
  private tools: McpToolDefinition[] | null = null;

  constructor(private readonly mcpBridge: McpBridge) {}

  /**
   * Fetch all tools from MCP via tools/list. Caches result until invalidated.
   * Returns empty array if MCP is unavailable.
   */
  async getTools(): Promise<McpToolDefinition[]> {
    if (this.tools !== null) {
      return this.tools;
    }

    if (!this.mcpBridge.isAvailable()) {
      return [];
    }

    try {
      const tools = await this.mcpBridge.listTools();
      this.tools = tools;
      return tools;
    } catch {
      // MCP unavailable or tools/list failed — return empty
      return [];
    }
  }

  /** Convert cached tools to Anthropic tool_use format */
  toAnthropicFormat(tools: McpToolDefinition[]): AnthropicTool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  /** Convert cached tools to OpenAI/Ollama function calling format */
  toOpenAIFormat(tools: McpToolDefinition[]): OpenAIFunction[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  /** Invalidate cache — call on MCP reconnect or tool changes */
  invalidate(): void {
    this.tools = null;
  }
}
