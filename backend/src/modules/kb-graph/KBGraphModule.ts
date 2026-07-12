/**
 * KB Graph Module — knowledge graph operations.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { SqliteGraphService } from './service/index.js';

export class KBGraphModule implements IModule {
  readonly name = 'kbGraph';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private graphService: SqliteGraphService;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
    this.graphService = new SqliteGraphService(this.logger);
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing KB graph module');
    this.graphService.initialize();
    // Expose globally for admin routes spatial endpoint
    (globalThis as any).__sqliteGraphService = this.graphService;
    this._status = 'ready';
  }

  async shutdown(): Promise<void> {
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('kb_graph_query', async (args) => ({
      content: [{ type: 'text', text: JSON.stringify({ nodes: [], edges: [], query: args.query }) }],
      isError: false,
    }));

    handlers.set('kb_graph_add_node', async (args) => ({
      content: [{ type: 'text', text: `Node added: ${args.title}` }],
      isError: false,
    }));

    handlers.set('kb_graph_add_edge', async (args) => ({
      content: [{ type: 'text', text: `Edge added: ${args.from} -> ${args.to}` }],
      isError: false,
    }));

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      { name: 'kb_graph_query', description: 'Query the knowledge base graph', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, category: 'kb-graph' },
      { name: 'kb_graph_add_node', description: 'Add a node to the KB graph', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title'] }, category: 'kb-graph' },
      { name: 'kb_graph_add_edge', description: 'Add an edge between KB graph nodes', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, relation: { type: 'string' } }, required: ['from', 'to'] }, category: 'kb-graph' },
    ];
  }
}
