/**
 * TransportFactory — Creates MCP transports from ServerConfig.
 * SA4E-37
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ServerConfig } from '../McpConfigService.js';

export function normalizeTransportType(type: string): string {
  if (type === 'streamable-http') return 'httpStream';
  return type; // stdio, sse pass through
}

export function createTransport(name: string, config: ServerConfig): unknown {
  const transportType = normalizeTransportType(config.type ?? config.transportType ?? '');
  if (transportType === 'sse') {
    return new SSEClientTransport(new URL(config.url!));
  }
  if (transportType === 'httpStream') {
    return new StreamableHTTPClientTransport(new URL(config.url!));
  }
  if (config.command) {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    Object.assign(env, config.env ?? {});
    return new StdioClientTransport({ command: config.command, args: config.args ?? [], env });
  }
  throw new Error(`Unknown transport for server ${name}`);
}
