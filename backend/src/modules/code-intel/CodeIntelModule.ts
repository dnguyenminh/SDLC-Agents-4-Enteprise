/**
 * Code Intelligence Module — handles code_* tool operations.
 * SA4E-53: DatabaseManager only created for SQLite engine.
 * PostgreSQL uses resolveEngineAdapter directly — no SQLite file created.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { IndexingEngine } from '../../engine/indexer/indexing-engine.js';
import { QueryLayer } from '../../engine/query/query-layer.js';
import { loadConfig } from '../../engine/config.js';
import { resolveEngineAdapter } from '../../database/factory/resolveEngineAdapter.js';
import { CODE_INTEL_TOOL_DEFINITIONS, dispatchCodeIntelTool } from '../../engine/tools/register-tools.js';
import { withErrorHandling, withTextResult } from '../../tool-router/ToolHandlerDecorators.js';

export class CodeIntelModule implements IModule {
  readonly name = 'codeIntel';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  /** Only set when engine is SQLite — null for PostgreSQL. */
  private dbManager: DatabaseManager | null = null;
  private indexer!: IndexingEngine;
  private workspace!: string;
  private queryLayer!: QueryLayer;
  private adapter!: DatabaseAdapter;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus { return this._status; }

  getIndexer(): IndexingEngine { return this.indexer; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing code intelligence module');
    try {
      const config = loadConfig();
      this.workspace = config.workspace;

      // Resolve adapter — only opens SQLite file when engine is sqlite
      this.adapter = await resolveEngineAdapter(config.dataDir, config.dbPath);

      // For SQLite: also initialize DatabaseManager (runs schema migrations, WAL mode, etc.)
      // For PostgreSQL: schema is managed via scripts/run-migrations.ts
      if (this.adapter.getEngine() === 'sqlite') {
        this.dbManager = new DatabaseManager(config.dbPath, config.projectId);
        this.dbManager.initialize();
      }

      this.queryLayer = new QueryLayer(this.adapter);
      this.indexer = new IndexingEngine(this.adapter, config);
      this.indexer.startBackgroundIndexing();
      this._status = 'ready';
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize code intelligence module');
      this._status = 'error';
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down code intelligence module');
    if (this.indexer) this.indexer.stop();
    if (this.dbManager) this.dbManager.close();
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    for (const def of CODE_INTEL_TOOL_DEFINITIONS) {
      const handler = withErrorHandling(this.logger, def.name)(
        withTextResult(
          async (args) => {
            const projectId = (args as Record<string, unknown>).__projectId as string | undefined;
            return dispatchCodeIntelTool(
              def.name, args,
              this.queryLayer, this.adapter, this.dbManager,
              this.indexer, this.workspace, projectId,
            );
          },
        ),
      );
      handlers.set(def.name, handler);
    }

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return CODE_INTEL_TOOL_DEFINITIONS.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema as any,
      category: 'code' as const,
    }));
  }
}
