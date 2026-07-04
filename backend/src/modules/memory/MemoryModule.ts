/**
 * Memory Module — handles mem_* tool operations.
 * Provides semantic search, memory storage, and retrieval.
 * In this stub: registers tool definitions but actual logic is placeholder.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { MemoryEngine } from './MemoryEngine.js';
import { MemoryToolDispatcher } from './MemoryToolDispatcher.js';
import { MEMORY_TOOL_DEFINITIONS } from './MemoryToolDefinitions.js';
import { loadConfig } from '../../engine/config.js';
import { QueryLayer } from '../../engine/query/query-layer.js';
import { migrate001AddScopeColumns } from './migrations/001-add-scope-columns.js';
import { ScopePromotionService } from './ScopePromotionService.js';
import { TagAnalyzerService } from './llm/TagAnalyzerService.js';
import { LLMService } from './llm/LLMService.js';
import type { ScopeContext } from './models.js';

export class MemoryModule implements IModule {
  readonly name = 'memory';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private dbManager!: DatabaseManager;
  private engine!: MemoryEngine;
  private dispatcher!: MemoryToolDispatcher;
  private promotionInterval: ReturnType<typeof setInterval> | null = null;
  private readonly sessionName: string;

  constructor(logger: Logger, sessionName?: string) {
    this.logger = logger.child({ module: this.name });
    this.sessionName = sessionName || `kiro-backend-${process.pid}`;
  }

  get status(): ModuleStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing memory module');
    try {
      const config = loadConfig();
      this.dbManager = new DatabaseManager(config.dbPath);
      this.dbManager.initialize();
      
      // Run migrations for existing DBs
      migrate001AddScopeColumns(this.dbManager.getDb());

      this.engine = new MemoryEngine(this.dbManager.getDb());
      // Start session with configurable name (unique per instance)
      this.engine.startSession(this.sessionName);
      
      const queryLayer = new QueryLayer(this.dbManager);
      this.dispatcher = new MemoryToolDispatcher(this.engine, config.workspace, queryLayer);

      // Initialize scope promotion service
      const promotionService = new ScopePromotionService(this.dbManager.getDb(), this.logger);
      this.dispatcher.setPromotionService(promotionService);

      // Initialize LLM-based tag analyzer
      try {
        const llmConfig = {
          provider: (process.env.LLM_PROVIDER || 'lmstudio') as any,
          model: process.env.LLM_MODEL || 'qwen3-8b',
          baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
          apiKey: process.env.LLM_API_KEY || undefined,
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
        };
        const llmService = new LLMService(llmConfig);
        const tagAnalyzer = new TagAnalyzerService(llmService, this.logger);
        this.dispatcher.setTagAnalyzer(tagAnalyzer);
        this.logger.info({ provider: llmConfig.provider, model: llmConfig.model, baseUrl: llmConfig.baseUrl }, 'TagAnalyzerService initialized — LLM auto-tagging enabled');
      } catch (err) {
        this.logger.warn({ err }, 'TagAnalyzerService init failed — fallback keyword tagging only');
      }

      // Start periodic promotion scan (every 1 hour)
      const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
      this.promotionInterval = setInterval(() => {
        try {
          const result = promotionService.runPromotionCycle();
          if (!result.includes('No promotion')) {
            this.logger.info({ result }, 'Periodic promotion scan completed');
          }
        } catch (err) {
          this.logger.error({ err }, 'Periodic promotion scan failed');
        }
      }, SCAN_INTERVAL_MS);
      
      this._status = 'ready';
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize memory module');
      this._status = 'error';
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory module');
    if (this.promotionInterval) {
      clearInterval(this.promotionInterval);
      this.promotionInterval = null;
    }
    if (this.engine) {
      this.engine.endSession();
    }
    if (this.dbManager) {
      this.dbManager.close();
    }
    this._status = 'stopped';
  }

  getEngine(): MemoryEngine {
    return this.engine;
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    for (const def of MEMORY_TOOL_DEFINITIONS) {
      handlers.set(def.name, async (args) => {
        try {
          // Extract scope context from args (injected by HTTP layer)
          const userId = (args as any).__userId as string | undefined;
          if (userId) {
            this.dispatcher.setScopeContext({ userId });
          } else {
            this.dispatcher.setScopeContext(undefined);
          }

          const text = this.dispatcher.dispatch(def.name, args as Record<string, unknown>);
          if (text === null) {
            return {
              content: [{ type: 'text', text: `Unknown tool: ${def.name}` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text }],
            isError: false,
          };
        } catch (error: any) {
          this.logger.error({ tool: def.name, err: error }, 'Tool execution failed');
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      });
    }

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return MEMORY_TOOL_DEFINITIONS.map(def => ({
      ...def,
      category: 'memory'
    })) as ToolDefinition[];
  }
}
