/**
 * SA4E-51 — KB Graph Module.
 * Passes getDbAdapter() to GraphService so graph_nodes/graph_edges
 * are stored in the active engine (SQLite or PostgreSQL), not hardcoded SQLite.
 * Facade (BR-18): tool definitions in kb-graph-tool-definitions.ts, handlers in
 * kb-graph-handlers.ts.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { getDbAdapter } from '../../admin/db/core.js';
import { GraphService } from './service/index.js';
import { getKbGraphToolDefinitions } from './kb-graph-tool-definitions.js';
import { registerQueryHandlers, registerAdminHandlers } from './kb-graph-handlers.js';

export class KBGraphModule implements IModule {
  readonly name = 'kbGraph';
  private _status: ModuleStatus = 'initializing';
  private readonly logger: Logger;
  private readonly graphService: GraphService;

  /**
   * @param logger - Pino logger; child logger scoped to module name is created internally
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
    // DIP: inject DatabaseAdapter so GraphService is engine-agnostic
    this.graphService = new GraphService(getDbAdapter(), this.logger);
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing KB graph module');
    await this.graphService.initialize();
    // Expose globally for admin routes spatial endpoint
    (globalThis as any).__sqliteGraphService = this.graphService;
    this._status = 'ready';
  }

  async shutdown(): Promise<void> {
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    registerQueryHandlers(handlers, this.graphService, this.logger);
    registerAdminHandlers(handlers, this.graphService);
    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return getKbGraphToolDefinitions();
  }
}
