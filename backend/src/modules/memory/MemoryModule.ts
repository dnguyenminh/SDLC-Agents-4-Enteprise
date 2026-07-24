/**
 * Memory Module — handles mem_* tool operations.
 * Builder pattern: initialize() delegates to MemoryModuleBuilder.
 * DIP: core dependencies injectable via MemoryModuleDeps.
 * SRP: LLM initialization delegated to LLMInitializer.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { MemoryEngine } from './engine/index.js';
import { MemoryToolDispatcher } from './dispatchers/index.js';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import { MEMORY_TOOL_DEFINITIONS } from './definitions/index.js';
import { loadConfig } from '../../engine/config.js';
import { stopScheduler } from './evolution/Scheduler.js';
import type { SchedulerHandles } from './evolution/Scheduler.js';
import { TaskWorker } from './task-queue/TaskWorker.js';
import type { ScopeContext } from './models.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { ScopePromotionService } from './promotion/index.js';
import { MemoryModuleBuilder } from './MemoryModuleBuilder.js';
import { withErrorHandling, withScopeContext, withResultFormat } from '../../tool-router/ToolHandlerDecorators.js';
import { bus, Events } from '../../shared/EventBus.js';
import { initLLMInBackground } from './llm/LLMInitializer.js';

/**
 * Injectable dependencies for MemoryModule.
 * All fields are optional — production uses default factories via initialize().
 * Tests can inject mocks to avoid real DB/filesystem access.
 */
export interface MemoryModuleDeps {
  dbManager?: DatabaseManager;
  memAdapter?: DatabaseAdapter;
  engine?: MemoryEngine;
  taskWorker?: TaskWorker;
  promotionService?: ScopePromotionService;
}

export class MemoryModule implements IModule {
  readonly name = 'memory';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  dbManager!: DatabaseManager;
  engine!: MemoryEngine;
  dispatcher!: MemoryToolDispatcher;
  promotionInterval: ReturnType<typeof setInterval> | null = null;
  readonly sessionName: string;
  schedulerHandles: SchedulerHandles | null = null;
  taskWorker: TaskWorker | null = null;
  private readonly registry?: ModuleRegistry;
  private readonly injectedDeps: MemoryModuleDeps;

  constructor(logger: Logger, sessionName?: string, registry?: ModuleRegistry, deps: MemoryModuleDeps = {}) {
    this.logger = logger.child({ module: this.name });
    this.sessionName = sessionName || `kiro-backend-${process.pid}`;
    this.registry = registry;
    this.injectedDeps = deps;
  }

  get status(): ModuleStatus { return this._status; }

  getInjectedDeps(): MemoryModuleDeps { return this.injectedDeps; }

  setDbManager(m: DatabaseManager): void { this.dbManager = m; }
  setEngine(e: MemoryEngine): void { this.engine = e; }
  setDispatcher(d: MemoryToolDispatcher): void { this.dispatcher = d; }
  setTaskWorker(w: TaskWorker): void { this.taskWorker = w; }
  setPromotionInterval(i: ReturnType<typeof setInterval> | null): void { this.promotionInterval = i; }
  setSchedulerHandles(h: SchedulerHandles | null): void { this.schedulerHandles = h; }
  setStatus(s: 'ready' | 'error'): void { this._status = s; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing memory module');
    try {
      const config = loadConfig();
      const builder = new MemoryModuleBuilder(this as any, this.logger, {
        dbPath: config.dbPath,
        dataDir: config.dataDir,
        workspace: config.workspace,
        sessionName: this.sessionName,
      });

      await builder.withDatabase();
      await builder.withEngine();
      builder.withDispatcher(this.registry);
      builder.withTaskWorker();
      builder.withPromotion();
      builder.withBackgroundLLM();
      builder.build();

      // Subscribe to LLM config changes — re-init services immediately without restart
      bus.on(Events.LLM_CONFIG_CHANGED, () => {
        this.logger.info('[MemoryModule] LLM config changed — re-initializing LLM services');
        this.reinitLLM();
      });

      // Subscribe to TaskWorker config changes — apply concurrency/intervals without restart
      bus.on(Events.TASK_WORKER_CONFIG_CHANGED, (payload: any) => {
        if (!this.taskWorker) return;
        const key = payload?.key as string;
        const raw = payload?.value;
        if (key === 'concurrency') this.taskWorker.updateConfig({ concurrency: parseInt(String(raw), 10) });
        else if (key === 'baseInterval') this.taskWorker.updateConfig({ baseInterval: parseInt(String(raw), 10) });
        else if (key === 'maxInterval') this.taskWorker.updateConfig({ maxInterval: parseInt(String(raw), 10) });
      });
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize memory module');
      this._status = 'error';
    }
  }

  /**
   * Re-initialize LLM services (TagAnalyzer + ClassifyService) using latest config from DB.
   * Called automatically when admin saves LLM config via UI — no restart needed.
   * Safe to call while running — fire-and-forget, replaces existing service references.
   */
  reinitLLM(): void {
    if (!this.dispatcher || !this.taskWorker) {
      this.logger.warn('[MemoryModule] Cannot reinit LLM — dispatcher or taskWorker not ready');
      return;
    }
    initLLMInBackground(this.dispatcher, this.taskWorker, this.logger);
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory module');
    if (this.schedulerHandles) { stopScheduler(this.schedulerHandles); this.schedulerHandles = null; }
    if (this.promotionInterval) { clearInterval(this.promotionInterval); this.promotionInterval = null; }
    if (this.engine) this.engine.endSession();
    if (this.dbManager) this.dbManager.close();
    this._status = 'stopped';
  }

  getEngine(): MemoryEngine { return this.engine; }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    for (const def of MEMORY_TOOL_DEFINITIONS) {
      const handler = withErrorHandling(this.logger, def.name)(
        withScopeContext(this.dispatcher)(
          withResultFormat(
            async (args) => this.dispatcher.dispatch(def.name, args as Record<string, unknown>),
          ),
        ),
      );
      handlers.set(def.name, handler);
    }
    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return MEMORY_TOOL_DEFINITIONS.map(def => ({ ...def, category: 'memory' })) as ToolDefinition[];
  }
}

