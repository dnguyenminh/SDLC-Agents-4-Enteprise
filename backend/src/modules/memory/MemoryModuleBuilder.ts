/**
 * MemoryModuleBuilder — fluent builder for MemoryModule initialization.
 * Builder pattern: decomposes the 69-line initialize() into focused steps.
 * Each with*() method handles one sub-step, improving testability and SRP.
 *
 * Usage:
 *   const mod = new MemoryModule(logger);
 *   await new MemoryModuleBuilder(mod)
 *     .withDatabase(config)
 *     .withEngine(config)
 *     .withDispatcher(config, registry)
 *     .withTaskWorker(config)
 *     .withPromotion(config)
 *     .withBackgroundLLM()
 *     .build();
 */

import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { MemoryEngine } from './engine/index.js';
import { MemoryToolDispatcher } from './dispatchers/index.js';
import { ConvertToolResolver } from './ingest/ConvertToolResolver.js';
import { RegistryOrchestrationGateway } from './ingest/OrchestrationGateway.js';
import { QueryLayer } from '../../engine/query/query-layer.js';
import { migrate001AddScopeColumns } from './migrations/001-add-scope-columns.js';
import { migrate002AddEvolutionColumns } from './migrations/002-add-evolution-columns.js';
import { migrate003PendingTasks } from './migrations/003-pending-tasks.js';
import { migrate004ResetSequences } from './migrations/004-reset-sequences.js';
import { ScopePromotionService } from './promotion/index.js';
import { startScheduler, stopScheduler } from './evolution/Scheduler.js';
import type { SchedulerHandles } from './evolution/Scheduler.js';
import { TaskWorker } from './task-queue/TaskWorker.js';
import type { TaskWorkerConfig } from './task-queue/TaskWorkerConfig.js';
import { resolveEngineAdapter } from '../../database/factory/resolveEngineAdapter.js';
import { initLLMInBackground } from './llm/LLMInitializer.js';
import type { MemoryModule, MemoryModuleDeps } from './MemoryModule.js';

const PROMOTION_SCAN_INTERVAL_MS = 60 * 60 * 1000;

export interface BuilderConfig {
  dataDir: string;
  dbPath?: string;
  workspace?: string;
  sessionName?: string;
  taskWorkerConfig?: Partial<TaskWorkerConfig>;
}

/**
 * MemoryModuleBuilder — constructs a MemoryModule step-by-step.
 * SA4E-53: updated ScopePromotionService constructor to use DatabaseAdapter.
 */
export class MemoryModuleBuilder {
  private memAdapter: DatabaseAdapter | null = null;

  constructor(
    private readonly mod: MemoryModule,
    private readonly logger: Logger,
    private readonly config: BuilderConfig,
  ) {}

  /** Step 1: Open SQLite/PG connection and run schema migrations. */
  /** Step 1: Open connection and run schema migrations.
   *  SA4E-53: DatabaseManager only created for SQLite — Postgres skips SQLite file.
   */
  async withDatabase(): Promise<this> {
    const dbPath = this.config.dbPath ?? `${this.config.dataDir}/memory.db`;
    const injectd = this.mod.getInjectedDeps();

    // Resolve adapter — only opens SQLite when engine is sqlite
    const injectAdapter = injectd.memAdapter;
    if (injectAdapter) {
      this.memAdapter = injectAdapter;
    } else {
      this.memAdapter = await resolveEngineAdapter(this.config.dataDir, dbPath);
    }

    // For SQLite: also initialize DatabaseManager (schema migrations, WAL, etc.)
    if (this.memAdapter.getEngine() === 'sqlite') {
      let dbManager: DatabaseManager;
      if (injectd.dbManager) {
        dbManager = injectd.dbManager;
      } else {
        dbManager = new DatabaseManager(dbPath);
        dbManager.initialize();
      }
      this.mod.setDbManager(dbManager);
    }

    // Run versioned migrations via DatabaseAdapter
    await migrate001AddScopeColumns(this.memAdapter);
    await migrate002AddEvolutionColumns(this.memAdapter);
    await migrate003PendingTasks(this.memAdapter);
    await migrate004ResetSequences(this.memAdapter);

    return this;
  }

  /** Step 2: Construct MemoryEngine and start a named session. */
  async withEngine(): Promise<this> {
    const injectd = this.mod.getInjectedDeps();
    const engine = injectd.engine ?? new MemoryEngine(this.memAdapter!);
    await engine.startSession(this.config.sessionName);
    this.mod.setEngine(engine);
    return this;
  }

  /** Step 3: Wire MemoryToolDispatcher with all services. */
  withDispatcher(registry?: ModuleRegistry): this {
    const { workspace = '' } = this.config;
    const queryLayer = this.memAdapter
      ? new QueryLayer(this.memAdapter!)
      : undefined;
    const dispatcher = new MemoryToolDispatcher(this.mod.engine, workspace, queryLayer);
    if (registry) {
      const gateway = new RegistryOrchestrationGateway(registry);
      const resolver = new ConvertToolResolver(gateway);
      dispatcher.setConvertResolver(resolver);
    }
    if (this.memAdapter) dispatcher.setDbAdapter(this.memAdapter);
    this.mod.setDispatcher(dispatcher);
    return this;
  }

  /** Step 4: Set up task worker for background enrichment. */
  withTaskWorker(): this {
    const injectd = this.mod.getInjectedDeps();
    const worker = injectd.taskWorker
      ? injectd.taskWorker
      : new TaskWorker(this.memAdapter!, this.mod.engine, this.logger, this.config.taskWorkerConfig);
    worker.start();
    this.mod.setTaskWorker(worker);
    return this;
  }

  /** Step 5: Start scope promotion service + background scheduler. */
  withPromotion(): this {
    const injectd = this.mod.getInjectedDeps();
    if (!injectd.promotionService && this.memAdapter) {
      // SA4E-53: ScopePromotionService now uses DatabaseAdapter
      const promotionService = new ScopePromotionService(this.memAdapter, this.logger);
      // Initialize table asynchronously (non-blocking)
      promotionService.ensurePromotionQueueTable().catch((err: unknown) => {
        this.logger.warn({ err }, '[MemoryModuleBuilder] promotion queue table init failed');
      });
      this.mod.dispatcher?.setPromotionService(promotionService);

      const interval = setInterval(() => {
        promotionService.runPromotionCycle().catch((err: unknown) => {
          this.logger.warn({ err }, 'Promotion cycle failed');
        });
      }, PROMOTION_SCAN_INTERVAL_MS);
      this.mod.setPromotionInterval(interval);
    } else if (injectd.promotionService) {
      this.mod.dispatcher?.setPromotionService(injectd.promotionService);
    }

    // Start decay/epoch scheduler — now uses adapter directly (all engines)
    if (this.mod.engine) {
      const handles = startScheduler(this.mod.engine.getAdapter(), this.logger);
      this.mod.setSchedulerHandles(handles);
    }
    return this;
  }

  /** Step 6: Kick off LLM initialization in background (non-blocking). */
  withBackgroundLLM(): this {
    if (this.mod.taskWorker) {
      try {
        initLLMInBackground(this.mod.dispatcher!, this.mod.taskWorker, this.logger);
      } catch (err: unknown) {
        this.logger.warn({ err }, 'LLM init failed');
      }
    }
    return this;
  }

  /** Finalize: mark module as ready. */
  build(): void {
    this.mod.setStatus('ready');
    this.logger.info('Memory module ready');
  }
}





