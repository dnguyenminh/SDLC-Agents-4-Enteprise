/**
 * Memory Module — handles mem_* tool operations.
 * Provides semantic search, memory storage, and retrieval.
 * In this stub: registers tool definitions but actual logic is placeholder.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { MemoryEngine } from './engine/index.js';
import { MemoryToolDispatcher } from './dispatchers/index.js';
import { ConvertToolResolver } from './ingest/ConvertToolResolver.js';
import { RegistryOrchestrationGateway } from './ingest/OrchestrationGateway.js';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import { MEMORY_TOOL_DEFINITIONS } from './definitions/index.js';
import { loadConfig } from '../../engine/config.js';
import { QueryLayer } from '../../engine/query/query-layer.js';
import { migrate001AddScopeColumns } from './migrations/001-add-scope-columns.js';
import { migrate002AddEvolutionColumns } from './migrations/002-add-evolution-columns.js';
import { ScopePromotionService } from './promotion/index.js';
import { startScheduler, stopScheduler } from './evolution/Scheduler.js';
import type { SchedulerHandles } from './evolution/Scheduler.js';
import { TagAnalyzerService } from './llm/analyzer.js';
import { TaskWorker } from './task-queue/TaskWorker.js';
import type { TaskWorkerConfig } from './task-queue/TaskWorkerConfig.js';
import { migrate003PendingTasks } from './migrations/003-pending-tasks.js';
import { EmbeddingService } from '../../engine/parsers/embedding/EmbeddingService.js';
import { SqliteDbAdapter } from './task-queue/SqliteDbAdapter.js';
import { LLMService } from './llm/LLMService.js';
import { ClassifyService } from './llm/classify-service.js';
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
  private schedulerHandles: SchedulerHandles | null = null;
  private taskWorker: TaskWorker | null = null;
  private readonly registry?: ModuleRegistry;

  constructor(logger: Logger, sessionName?: string, registry?: ModuleRegistry) {
    this.logger = logger.child({ module: this.name });
    this.sessionName = sessionName || `kiro-backend-${process.pid}`;
    this.registry = registry;
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
      migrate002AddEvolutionColumns(this.dbManager.getDb());
      migrate003PendingTasks(this.dbManager.getDb());

      const memAdapter = new SqliteDbAdapter(this.dbManager.getDb());
      this.engine = new MemoryEngine(memAdapter);
      // Start session with configurable name (unique per instance)
      this.engine.startSession(this.sessionName);
      
      const queryLayer = new QueryLayer(this.dbManager);
      this.dispatcher = new MemoryToolDispatcher(this.engine, config.workspace, queryLayer);

      // Wire ConvertToolResolver via dynamic tool (find_tools + execute_dynamic_tool).
      if (this.registry) {
        const gateway = new RegistryOrchestrationGateway(this.registry);
        this.dispatcher.setConvertResolver(new ConvertToolResolver(gateway));
        this.logger.info('ConvertToolResolver wired with RegistryOrchestrationGateway');
      } else {
        this.logger.info('No registry available — binary files will be marked unconvertible (no-tool)');
      }

      // SA4E-44: Wire DatabaseAdapter for transactional ingest
      const dbAdapter = new SqliteDbAdapter(this.dbManager.getDb());
      this.dispatcher.setDbAdapter(dbAdapter);

      // SA4E-44: Initialize TaskWorker
      const workerConfig: Partial<TaskWorkerConfig> = {
        baseInterval: parseInt(process.env.TASK_WORKER_BASE_INTERVAL || '2000', 10),
        maxInterval: parseInt(process.env.TASK_WORKER_MAX_INTERVAL || '30000', 10),
        staleThreshold: parseInt(process.env.TASK_WORKER_STALE_THRESHOLD || '300000', 10),
        maxRetries: parseInt(process.env.TASK_WORKER_MAX_RETRIES || '3', 10),
      };
      this.taskWorker = new TaskWorker(dbAdapter, this.engine, this.logger, workerConfig);
      this.taskWorker.recoverStaleTasks();
      this.taskWorker.start();

      // Initialize scope promotion service
      const promotionService = new ScopePromotionService(this.dbManager.getDb(), this.logger);
      this.dispatcher.setPromotionService(promotionService);

      // Initialize LLM health check in background — never block module startup
      this.initLLMInBackground();

      this.schedulerHandles = startScheduler(this.dbManager.getDb(), this.logger);
      const SCAN_INTERVAL_MS = 60 * 60 * 1000;
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
    if (this.schedulerHandles) {
      stopScheduler(this.schedulerHandles);
      this.schedulerHandles = null;
    }
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

  private initLLMInBackground(): void {
    const llmConfig = {
      provider: (process.env.LLM_PROVIDER || 'lmstudio') as any,
      model: process.env.LLM_MODEL || 'qwen3-8b',
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
      apiKey: process.env.LLM_API_KEY || undefined,
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
    };
    const healthUrl = llmConfig.baseUrl.replace(/\/v1\/?$/, '') + '/v1/models';

    // Fire-and-forget: never block module startup
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const healthResp = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!healthResp.ok) {
          this.logger.info({ provider: llmConfig.provider, baseUrl: llmConfig.baseUrl }, 'TagAnalyzer LLM provider not reachable — using keyword fallback only');
          return;
        }
        const llmService = new LLMService(llmConfig);
        const tagAnalyzer = new TagAnalyzerService(llmService, this.logger);
        this.dispatcher.setTagAnalyzer(tagAnalyzer);
        this.taskWorker?.setTagAnalyzer(tagAnalyzer);
        this.logger.info({ provider: llmConfig.provider, model: llmConfig.model, baseUrl: llmConfig.baseUrl }, 'TagAnalyzerService initialized — LLM auto-tagging enabled');
        const classifyService = new ClassifyService(llmService);
        this.dispatcher.setClassifyService(classifyService);
        this.logger.info('ClassifyService initialized — Smart KB Ingest enabled');
        // SA4E-44: Wire EmbeddingService to worker
        try {
          const embSvc = EmbeddingService.getInstance();
          this.taskWorker?.setEmbeddingService(embSvc);
          this.dispatcher.setEmbeddingAvailable(true);
        } catch { /* ONNX not available */ }
      } catch (err) {
        this.logger.info({ err }, 'TagAnalyzer LLM unavailable — using keyword fallback only');
      }
    })();
  }

  getEngine(): MemoryEngine {
    return this.engine;
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    for (const def of MEMORY_TOOL_DEFINITIONS) {
      handlers.set(def.name, async (args) => {
        try {
          // Extract scope context from args (injected by REST API layer — SA4E-30)
          const injectedCtx = (args as any)._projectContext;
          if (injectedCtx) {
            this.dispatcher.setScopeContext({ userId: injectedCtx.userId || '', projectId: injectedCtx.projectId || '' });
          } else {
            // Legacy: try __userId for backward compat
            const userId = (args as any).__userId as string | undefined;
            if (userId) {
              this.dispatcher.setScopeContext({ userId });
            } else {
              this.dispatcher.setScopeContext(undefined);
            }
          }

          const text = await this.dispatcher.dispatch(def.name, args as Record<string, unknown>);
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
