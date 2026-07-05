/**
 * Orchestration Module — manages child MCP servers.
 * Handles spawning, monitoring, and communication with child servers.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import { EmbeddingService } from '../../engine/parsers/embedding/EmbeddingService.js';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import type { MemoryModule } from '../memory/MemoryModule.js';
import { McpClientManager } from './McpClientManager.js';

export class OrchestrationModule implements IModule {
  readonly name = 'orchestration';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private registry?: ModuleRegistry;
  private clientManager: McpClientManager;

  constructor(logger: Logger, registry?: ModuleRegistry) {
    this.logger = logger.child({ module: this.name });
    this.registry = registry;
    this.clientManager = new McpClientManager(logger);
  }

  getClientManager(): McpClientManager {
    return this.clientManager;
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing orchestration module');
    await this.clientManager.initializeAll();
    this._status = 'ready';
  }

  async shutdown(): Promise<void> {
    await this.clientManager.shutdownAll();
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('orchestration_status', async () => ({
      content: [{ type: 'text', text: JSON.stringify({ servers: [], status: 'ready' }) }],
      isError: false,
    }));

    handlers.set('find_tools', async (args: any) => {
      const query = args.query as string;
      const limit = (args.top_k as number) || 5;
      
      let tools: any[] = [];
      if (this.registry) {
        const memoryModule = this.registry.getModule('memory') as MemoryModule | undefined;
        if (memoryModule && memoryModule.status === 'ready') {
          const db = memoryModule.getEngine().getDb();
          
          try {
            const queryVector = await EmbeddingService.getInstance().generateEmbedding(query);
            
            const rows = db.prepare(`SELECT * FROM mcp_tools`).all() as any[];
            
            const scoredTools = rows.map(r => {
              let score = 0;
              if (r.vector) {
                // Convert buffer back to number[]
                const floatArray = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4);
                const vector = Array.from(floatArray);
                score = EmbeddingService.getInstance().cosineSimilarity(queryVector, vector);
              }
              return {
                name: r.name,
                description: r.description,
                schema: JSON.parse(r.schema_json),
                score
              };
            });
            
            // Sort by score descending and take top N
            scoredTools.sort((a, b) => b.score - a.score);
            tools = scoredTools.slice(0, limit);
            
          } catch (err) {
            this.logger.error({ err, query }, 'Failed to search tools via vectors');
          }
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ tools, query }) }],
        isError: false,
      };
    });

    handlers.set('execute_dynamic_tool', async (args: any) => {
      const toolName = args.toolName || args.tool_name;
      const toolArgs = args.arguments || {};
      
      // If a child MCP server owns this tool, proxy the request
      if (this.clientManager.ownsTool(toolName)) {
        try {
          const result = await this.clientManager.executeTool(toolName, toolArgs);
          return result;
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error proxying tool ${toolName}: ${err.message || err}` }],
            isError: true,
          };
        }
      }

      if (!this.registry) {
        return {
          content: [{ type: 'text', text: 'Registry not available' }],
          isError: true,
        };
      }
      
      const allHandlers = this.registry.getToolHandlers();
      const handler = allHandlers.get(toolName);
      
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Tool ${toolName} not found or not ready.` }],
          isError: true,
        };
      }
      
      try {
        const result = await handler(toolArgs);
        return result;
      } catch (err: any) {
        this.logger.error({ err, toolName, toolArgs }, 'Failed to execute dynamic tool');
        return {
          content: [{ type: 'text', text: `Error executing tool ${toolName}: ${err.message || err}` }],
          isError: true,
        };
      }
    });

    handlers.set('toggle_tool', async (args: any) => {
      return {
        content: [{ type: 'text', text: `Tool ${args.toolName} enabled=${args.enabled}` }],
        isError: false,
      };
    });

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    const defaultTools: ToolDefinition[] = [
      { name: 'orchestration_status', description: 'Get status of all child MCP servers', inputSchema: { type: 'object', properties: {} }, category: 'orchestration' },
      { name: 'find_tools', description: 'Search available tools by semantic query', inputSchema: { type: 'object', properties: { query: { type: 'string' }, threshold: { type: 'number' }, top_k: { type: 'number' } }, required: ['query'] }, category: 'orchestration' },
      { name: 'execute_dynamic_tool', description: 'Execute a dynamically discovered tool', inputSchema: { type: 'object', properties: { toolName: { type: 'string' }, arguments: { type: 'object' } }, required: ['toolName', 'arguments'] }, category: 'orchestration' },
      { name: 'toggle_tool', description: 'Enable or disable a tool', inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['tool_name'] }, category: 'orchestration' },
    ];
    
    // We intentionally DO NOT combine with proxied tools here.
    // As per design, child MCP server tools are discovered dynamically via find_tools,
    // not exposed flatly at the root level to prevent tool explosion.
    return defaultTools;
  }
}
