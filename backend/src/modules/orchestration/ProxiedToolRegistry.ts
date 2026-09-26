/**
 * ProxiedToolRegistry — tracks tools proxied from child MCP servers.
 * SA4E-218: reserved (locally-provided) tool names are never shadowed by child servers.
 * Extracted from McpClientManager (SA4E-223 line-count gate, <= 200 lines/file).
 */

import type { Logger } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolDefinition } from '../../types/tool.js';

export class ProxiedToolRegistry {
  private toolsToServer: Map<string, string> = new Map();
  private proxiedTools: ToolDefinition[] = [];
  /** Tool names provided locally by the orchestrator/registry — child servers must never shadow these. */
  private reservedToolNames: Set<string> = new Set();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ProxiedToolRegistry' });
  }

  /** Reserve a set of tool names that are provided locally by the orchestrator/registry. */
  setReservedToolNames(names: Set<string>): void { this.reservedToolNames = names; }

  ownsTool(toolName: string): boolean { return this.toolsToServer.has(toolName); }

  /** Returns the child server name owning a tool, or undefined if not proxied. */
  getOwningServer(toolName: string): string | undefined { return this.toolsToServer.get(toolName); }

  getProxiedTools(): ToolDefinition[] { return this.proxiedTools; }

  getToolCount(serverName: string): number {
    let count = 0;
    for (const [, sn] of this.toolsToServer.entries()) { if (sn === serverName) count++; }
    return count;
  }

  async registerServerTools(name: string, client: Client): Promise<void> {
    const toolsResult = await client.listTools();
    for (const tool of toolsResult.tools ?? []) {
      // SA4E-218: never allow a child server to shadow a locally-provided (reserved) tool.
      if (this.reservedToolNames.has(tool.name)) {
        this.logger.warn({ tool: tool.name, server: name }, 'Skipping child tool registration: name conflicts with a locally-provided (reserved) tool — preventing shadowing');
        continue;
      }
      this.toolsToServer.set(tool.name, name);
      this.proxiedTools.push({
        name: tool.name, description: tool.description ?? '',
        category: name as ToolDefinition['category'], inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      });
    }
  }

  clearServerTools(name: string): void {
    const names: string[] = [];
    for (const [tn, sn] of this.toolsToServer.entries()) { if (sn === name) names.push(tn); }
    for (const tn of names) this.toolsToServer.delete(tn);
    this.proxiedTools = this.proxiedTools.filter((t) => !names.includes(t.name));
  }
}
