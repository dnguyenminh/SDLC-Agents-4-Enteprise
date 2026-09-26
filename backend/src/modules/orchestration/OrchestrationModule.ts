/**
 * Orchestration Module — manages child MCP servers and tool discovery.
 * DIP fix: find_tools handler depends on ToolSearchService interface,
 * not on MemoryModule internals (getEngine().getDb()). Service is injected
 * after modules are initialized via setToolSearchService().
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import { McpClientManager } from './McpClientManager.js';
import { trackToolUsage } from '../../server/toolUsageTracker.js';
import { createReindexSubscriber } from './reindex/ReindexSubscriberFactory.js';
import type { ReindexSubscriber } from './reindex/ReindexSubscriber.js';
import type { ToolSearchService } from './ToolSearchService.js';

export class OrchestrationModule implements IModule {
  readonly name = 'orchestration';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private registry?: ModuleRegistry;
  private clientManager: McpClientManager;
  private reindexSubscriber?: ReindexSubscriber;
  /** Injected after module init — depends on abstraction, not MemoryModule concrete. */
  private toolSearchService?: ToolSearchService;

  constructor(logger: Logger, registry?: ModuleRegistry) {
    this.logger = logger.child({ module: this.name });
    this.registry = registry;
    this.clientManager = new McpClientManager(logger);
  }

  getClientManager(): McpClientManager { return this.clientManager; }
  get status(): ModuleStatus { return this._status; }

  /**
   * DIP: called from index.ts after MemoryModule is ready.
   * Injects a ToolSearchService backed by the memory DB without coupling this module to MemoryModule.
   */
  setToolSearchService(svc: ToolSearchService): void {
    this.toolSearchService = svc;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing orchestration module');

    // SA4E-218: reserve locally-provided tool names so child MCP servers can never
    // shadow them (e.g. a mis-schema'd external Atlassian server must not override our
    // own jira_create_issue / jira_search handlers).
    if (this.registry) {
      const reserved = new Set<string>(this.registry.getToolHandlers().keys());
      this.clientManager.setReservedToolNames(reserved);
    }

    await this.clientManager.initializeAll();
    this.clientManager.startHealthMonitor();
    this.reindexSubscriber = createReindexSubscriber(this.clientManager, this.logger, this.registry);
    this.reindexSubscriber.start();
    this._status = 'ready';
  }

  async shutdown(): Promise<void> {
    this.reindexSubscriber?.stop();
    this.reindexSubscriber = undefined;
    this.clientManager.stopHealthMonitor();
    await this.clientManager.shutdownAll();
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('orchestration_status', async () => {
      const servers = this.clientManager.getServersStatus();
      const totalProxiedTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
      return {
        content: [{ type: 'text', text: JSON.stringify({ servers, serverCount: servers.length, totalProxiedTools, status: 'ready' }) }],
        isError: false,
      };
    });

    handlers.set('find_tools', async (args: any) => {
      const query = args.query as string;
      const limit = (args.top_k as number) || 5;

      if (!this.toolSearchService) {
        this.logger.warn('find_tools called but ToolSearchService not yet injected');
        return { content: [{ type: 'text', text: JSON.stringify({ tools: [], query }) }], isError: false };
      }

      const tools = await this.toolSearchService.search(query, limit);
      return { content: [{ type: 'text', text: JSON.stringify({ tools, query }) }], isError: false };
    });

    handlers.set('execute_dynamic_tool', async (args: any) => {
      const toolName = args.toolName || args.tool_name;
      const innerArgs = args.arguments || {};

      // Proxy to child MCP server if it owns this tool.
      // Child servers are separate processes with their own schemas — forward ONLY
      // the caller's declared arguments, never our internal scope keys (avoid leaking
      // __projectId/_projectContext to third-party servers and tripping strict schemas).
      if (this.clientManager.ownsTool(toolName)) {
        try {
          const result = await this.clientManager.executeTool(toolName, innerArgs);
          if (this.registry && !result.isError) {
            trackToolUsage(this.registry, this.logger, toolName);
          }
          return result;
        } catch (err: any) {
          return { content: [{ type: 'text', text: `Error proxying tool ${toolName}: ${err.message || err}` }], isError: true };
        }
      }

      if (!this.registry) {
        return { content: [{ type: 'text', text: 'Registry not available' }], isError: true };
      }

      const handler = this.registry.getToolHandlers().get(toolName);
      if (!handler) {
        return { content: [{ type: 'text', text: `Tool ${toolName} not found` }], isError: true };
      }

      // SA4E-41: the trusted tenant scope (__projectId/__userId/_projectContext) is
      // stamped on the OUTER execute_dynamic_tool args by the dispatch layer. Forward
      // it into the nested LOCAL tool's arguments, otherwise scoped reads like
      // code_search run fail-closed (empty) when invoked via find_tools/dynamic.
      const toolArgs = propagateScope(args, innerArgs);

      try {
        const result = await handler(toolArgs);
        if (!result.isError) trackToolUsage(this.registry, this.logger, toolName);
        return result;
      } catch (err: any) {
        this.logger.error({ err, toolName }, 'Failed to execute dynamic tool');
        return { content: [{ type: 'text', text: `Error executing tool ${toolName}: ${err.message || err}` }], isError: true };
      }
    });

    handlers.set('toggle_tool', async (args: any) => ({
      content: [{ type: 'text', text: `Tool ${args.toolName} enabled=${args.enabled}` }],
      isError: false,
    }));

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      { name: 'orchestration_status', description: 'Get status of all child MCP servers', inputSchema: { type: 'object', properties: {} }, category: 'orchestration' },
      { name: 'find_tools', description: 'Search available tools by semantic query', inputSchema: { type: 'object', properties: { query: { type: 'string' }, threshold: { type: 'number' }, top_k: { type: 'number' } }, required: ['query'] }, category: 'orchestration' },
      { name: 'execute_dynamic_tool', description: 'Execute a dynamically discovered tool', inputSchema: { type: 'object', properties: { toolName: { type: 'string' }, arguments: { type: 'object' } }, required: ['toolName', 'arguments'] }, category: 'orchestration' },
      { name: 'toggle_tool', description: 'Enable or disable a tool', inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['tool_name'] }, category: 'orchestration' },
    ];
  }
}

/** Trusted scope keys stamped by the dispatch layer (SA4E-41). */
const SCOPE_KEYS = ['__projectId', '__userId', '__workspaceRoot', '_projectContext'] as const;

/**
 * Forward trusted tenant scope from the outer execute_dynamic_tool args into the
 * nested tool's arguments. Without this, scoped reads (code_search, get_curated_context,
 * pega_*) run fail-closed when invoked via find_tools/execute_dynamic_tool, because
 * the scope keys live on the OUTER args, not inside `arguments`.
 *
 * @param outer - The execute_dynamic_tool args carrying stamped scope keys.
 * @param inner - The nested tool's own arguments (`args.arguments`).
 * @returns inner args enriched with any scope keys present on outer (inner wins on conflict).
 */
function propagateScope(
  outer: Record<string, unknown>,
  inner: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...inner };
  for (const key of SCOPE_KEYS) {
    if (outer[key] !== undefined && merged[key] === undefined) {
      merged[key] = outer[key];
    }
  }
  return merged;
}
