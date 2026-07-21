/**
 * Code Intelligence Module — handles code_* tool operations.
 * Provides code indexing, search, and symbol resolution.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { IndexingEngine } from '../../engine/indexer/indexing-engine.js';
import { loadConfig } from '../../engine/config.js';
import { SqliteDbAdapter } from '../memory/task-queue/SqliteDbAdapter.js';
import { resolveEngineAdapter } from '../../database/factory/resolveEngineAdapter.js';
import * as path from 'path';
import { CODE_INTEL_TOOL_DEFINITIONS, dispatchCodeIntelTool } from '../../engine/tools/register-tools.js';

export class CodeIntelModule implements IModule {
  readonly name = 'codeIntel';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private dbManager!: DatabaseManager;
  private indexer!: IndexingEngine;
  private workspace!: string;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus { return this._status; }

  getIndexer(): IndexingEngine {
    return this.indexer;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing code intelligence module');
    try {
      const config = loadConfig();
      this.workspace = config.workspace;
      this.dbManager = new DatabaseManager(config.dbPath, config.projectId);
      this.dbManager.initialize();
      const adapter = await resolveEngineAdapter(this.dbManager.getDb(), path.dirname(config.dbPath));
      this.indexer = new IndexingEngine(adapter, config);
      this.indexer.startBackgroundIndexing();
      this._status = 'ready';
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize code intelligence module');
      this._status = 'error';
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down code intelligence module');
    if (this.indexer) {
      this.indexer.stop();
    }
    if (this.dbManager) {
      this.dbManager.close();
    }
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    for (const def of CODE_INTEL_TOOL_DEFINITIONS) {
      handlers.set(def.name, async (args) => {
        try {
          // SA4E-41: ADR-001 injection path stamps __projectId onto tool args.
          const projectId = (args as Record<string, unknown>).__projectId as string | undefined;
          const result = await dispatchCodeIntelTool(def.name, args, this.dbManager, this.indexer, this.workspace, projectId);
          return { content: [{ type: 'text', text: result }], isError: false };
        } catch (error: any) {
          return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
        }
      });
    }

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return CODE_INTEL_TOOL_DEFINITIONS.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema as any,
      category: 'code'
    }));
  }
}
