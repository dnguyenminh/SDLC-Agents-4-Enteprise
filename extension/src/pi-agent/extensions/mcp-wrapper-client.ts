/**
 * MCP Wrapper Client for Pi Extensions
 * Proxies tool calls to MCP wrapper server running on port 9181
 */

export interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
  id: number;
}

export interface McpResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number;
}

export class McpWrapperClient {
  private readonly baseUrl: string;
  private requestId = 0;

  constructor(baseUrl = 'http://127.0.0.1:9181/mcp') {
    this.baseUrl = baseUrl;
  }

  async callMcpWrapper(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: McpRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
      id,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`MCP wrapper unavailable: HTTP ${response.status}`);
      }

      const data: McpResponse = await response.json();

      if (data.error) {
        throw new Error(`MCP error for tool ${toolName}: ${data.error.message}`);
      }

      return data.result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`MCP wrapper unavailable: ${message}`);
    }
  }
}

/**
 * Factory function for creating MCP wrapper client with default configuration
 */
export function createMcpClient(): McpWrapperClient {
  return new McpWrapperClient();
}
