import fs from 'fs';
import path from 'path';
import type { Logger } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig, getWorkspacePath } from '../../config/BackendConfig.js';
import type { ToolDefinition } from '../../types/tool.js';

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private toolsToServer: Map<string, string> = new Map();
  private proxiedTools: ToolDefinition[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'McpClientManager' });
  }

  async initializeAll(): Promise<void> {
    const cfg = loadConfig();
    const configPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    if (!fs.existsSync(configPath)) {
      this.logger.warn({ configPath }, 'orchestration.json not found, skipping child servers');
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const servers = config.mcpServers || {};

      const connectPromises = Object.entries(servers).map(async ([serverName, serverConfig]: [string, any]) => {
        if (serverConfig.disabled) {
          this.logger.info({ serverName }, 'Skipping disabled server');
          return;
        }
        // Skip code-intelligence since it's us
        if (serverName === 'code-intelligence') {
          return;
        }

        try {
          this.logger.info({ serverName }, 'Connecting to child MCP server');
          const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
          
          let transport: any;
          if (serverConfig.type === 'sse' || serverConfig.transportType === 'sse') {
            transport = new SSEClientTransport(new URL(serverConfig.url));
          } else if (serverConfig.type === 'httpStream' || serverConfig.transportType === 'httpStream') {
            transport = new StreamableHTTPClientTransport(new URL(serverConfig.url));
          } else if (serverConfig.command) {
            transport = new StdioClientTransport({
              command: serverConfig.command,
              args: serverConfig.args || [],
              env: { ...process.env, ...(serverConfig.env || {}) }
            });
          } else {
            this.logger.warn({ serverName }, 'Unknown transport type configuration');
            return;
          }

          // Don't wait forever, add a timeout for connecting
          const connectPromise = client.connect(transport);
          await Promise.race([
            connectPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
          ]);

          this.clients.set(serverName, client);
          this.logger.info({ serverName }, 'Connected to child server. Fetching tools...');

          // Fetch tools
          const toolsResult = await client.listTools();
          const tools = toolsResult.tools || [];
          
          for (const tool of tools) {
            this.toolsToServer.set(tool.name, serverName);
            this.proxiedTools.push({
              name: tool.name,
              description: tool.description || '',
              category: serverName as any,
              inputSchema: tool.inputSchema as any
            });
          }
          this.logger.info({ serverName, toolCount: tools.length }, 'Imported tools from child server');
        } catch (err: any) {
          this.logger.error({ err: err.message, serverName }, 'Failed to connect to child server');
        }
      });

      // Wait for all connections to settle
      await Promise.allSettled(connectPromises);

    } catch (err) {
      this.logger.error({ err }, 'Failed to parse orchestration.json');
    }
  }

  getProxiedTools(): ToolDefinition[] {
    return this.proxiedTools;
  }

  ownsTool(toolName: string): boolean {
    return this.toolsToServer.has(toolName);
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const serverName = this.toolsToServer.get(toolName);
    if (!serverName) {
      throw new Error(`Tool ${toolName} is not managed by any child server`);
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Client for server ${serverName} is disconnected`);
    }

    this.logger.info({ toolName, serverName }, 'Proxying tool execution to child server');
    
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      return {
        content: result.content,
        isError: result.isError
      };
    } catch (err: any) {
      this.logger.error({ err, toolName, serverName }, 'Tool execution failed on child server');
      throw err;
    }
  }

  async shutdownAll(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (e) {
        this.logger.error({ err: e, serverName: name }, 'Error closing client');
      }
    }
  }

  // --- Config Persistence API support ---

  isServerConnected(name: string): boolean {
    return this.clients.has(name);
  }

  getServerToolCount(name: string): number {
    let count = 0;
    for (const [, serverName] of this.toolsToServer.entries()) {
      if (serverName === name) count++;
    }
    return count;
  }

  async connectServer(name: string, config: any): Promise<void> {
    if (config.disabled || name === 'code-intelligence') return;

    let transport: any;
    if (config.type === 'sse' || config.transportType === 'sse') {
      transport = new SSEClientTransport(new URL(config.url));
    } else if (config.type === 'httpStream' || config.transportType === 'httpStream') {
      transport = new StreamableHTTPClientTransport(new URL(config.url));
    } else if (config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) },
      });
    } else {
      throw new Error(`Unknown transport for server ${name}`);
    }

    const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
    await Promise.race([
      client.connect(transport),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), 10000)),
    ]);

    this.clients.set(name, client);
    const toolsResult = await client.listTools();
    for (const tool of (toolsResult.tools || [])) {
      this.toolsToServer.set(tool.name, name);
      this.proxiedTools.push({
        name: tool.name,
        description: tool.description || '',
        category: name as any,
        inputSchema: tool.inputSchema as any,
      });
    }
    this.logger.info({ name, tools: toolsResult.tools?.length ?? 0 }, 'Server connected via config API');
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      try { await client.close(); } catch { /* ok */ }
      this.clients.delete(name);
    }
    for (const [toolName, serverName] of this.toolsToServer.entries()) {
      if (serverName === name) this.toolsToServer.delete(toolName);
    }
    this.proxiedTools = this.proxiedTools.filter(t => t.category !== name);
  }
}
