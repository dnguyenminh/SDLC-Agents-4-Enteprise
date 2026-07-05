/**
 * Core tool type definitions for the Backend MCP Server.
 * These types define the contract between modules and the tool routing layer.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: 'memory' | 'code' | 'orchestration' | 'analytics' | 'kb-graph' | 'utility' | 'web';
}

export interface ToolResult {
  content: ToolContent[];
  isError: boolean;
}

export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolCallRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  content: ToolContent[];
  isError: boolean;
}

export interface ToolListResponse {
  tools: ToolDefinition[];
}
