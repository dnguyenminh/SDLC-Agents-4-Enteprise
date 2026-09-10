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
import { migrate005FixPendingTasksSerial } from './migrations/005-fix-pending-tasks-serial.js';
import { migrate006FixFilesSchema } from './migrations/006-fix-files-schema.js';
import { migrate005UniqueSourceProject } from './migrations/005-unique-source-project.js';
import { migrate006PendingTasksProjectId } from './migrations/006-pending-tasks-project-id.js';
import { migrate008PendingTasksDriftColumns } from './migrations/008-pending-tasks-drift-columns.js';
import { ScopePromotionService } from './promotion/index.js';
import { TierConsolidationService } from './consolidation/service.js';
import { startScheduler } from './evolution/Scheduler.js';
import { TaskWorker } from './task-queue/TaskWorker.js';
import type { TaskWorkerConfig } from './task-queue/TaskWorkerConfig.js';
import { resolveEngineAdapter } from '../../database/factory/resolveEngineAdapter.js';
import { initLLMInBackground } from './llm/LLMInitializer.js';
import type { MemoryModule } from './MemoryModule.js';

const PROMOTION_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;

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

    // PostgreSQL: DatabaseManager (which applies the base SQLite schema) is
    // skipped, so create the base memory tables here before migrations — the
    // migrations only ALTER and would otherwise fail on missing relations.
    if (this.memAdapter.getEngine() === 'postgresql') {
      const { ensurePostgresMemorySchema } = await import('./schema/tables-pg.js');
      await ensurePostgresMemorySchema(this.memAdapter);
    }

    // Run versioned migrations via DatabaseAdapter
    await migrate001AddScopeColumns(this.memAdapter);
    await migrate002AddEvolutionColumns(this.memAdapter);
    await migrate003PendingTasks(this.memAdapter);
    await migrate004ResetSequences(this.memAdapter);
    await migrate005FixPendingTasksSerial(this.memAdapter);
    await migrate006FixFilesSchema(this.memAdapter);
    await migrate005UniqueSourceProject(this.memAdapter);
    await migrate006PendingTasksProjectId(this.memAdapter);
    // SA4E-6 follow-up: heal pending_tasks column drift (priority, etc.) on legacy DBs
    await migrate008PendingTasksDriftColumns(this.memAdapter);

    // SA4E-79: Add enrichment_status tracking columns
    const { migrate007Up } = await import('./schema/migrations/007_enrichment_status.js');
    await migrate007Up(this.memAdapter).catch(err => {
      // Column already exists — safe to ignore
      if (!String(err).includes('duplicate column') && !String(err).includes('already exists')) {
        this.logger.warn({ err }, '[MemoryModuleBuilder] Migration 007 issue (non-fatal)');
      }
    });

    // SA4E-45: Ensure PostgreSQL FTS infrastructure exists (tsvector_content + GIN index)
    if (this.memAdapter.getEngine() === 'postgresql') {
      const { recreateFtsInfrastructure } = await import('../../database/migration/fts-recreation.js');
      await recreateFtsInfrastructure(this.memAdapter).catch(err => {
        this.logger.warn({ err }, '[MemoryModuleBuilder] FTS recreation failed (non-fatal)');
      });
    }

    return this;
  }

  /** Step 2: Construct MemoryEngine and start a named session. */
  async withEngine(): Promise<this> {
    const injectd = this.mod.getInjectedDeps();
    const engine = injectd.engine ?? new MemoryEngine(this.memAdapter!);
    await engine.startSession(this.config.sessionName);
    this.mod.setEngine(engine);
    // Reconcile orphan graph nodes on startup (non-blocking)
    engine.reconcileOrphanGraphNodes().then(orphans => {
      if (orphans > 0) this.logger.info({ orphans }, '[MemoryModuleBuilder] Removed orphan graph nodes');
    }).catch((err: unknown) => {
      this.logger.warn({ err }, '[MemoryModuleBuilder] Graph reconciliation skipped');
    });
    return this;
  }

  /** Step 2b: Rebuild FTS index if empty (SA4E-79 FTS bug fix). */
  async withFtsRebuild(): Promise<this> {
    if (!this.memAdapter || this.memAdapter.getEngine() !== 'sqlite') return this;
    try {
      const count = await this.memAdapter.getAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM knowledge_fts',
      );
      if (count && count.cnt > 0) return this;
      this.logger.info('[FTS] knowledge_fts is empty — triggering rebuild from knowledge_entries');
      await this.memAdapter.runAsync(
        "INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')",
      );
      const rebuilt = await this.memAdapter.getAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM knowledge_fts',
      );
      this.logger.info({ rebuilt: rebuilt?.cnt ?? 0 }, '[FTS] Rebuild complete');
    } catch (err) {
      this.logger.warn({ err }, '[FTS] Rebuild failed (non-fatal)');
    }
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

    // SA4E-107: Load persisted TaskWorker config from DB (Admin UI values survive restart)
    this.loadPersistedTaskWorkerConfig(worker).catch(err => {
      this.logger.debug({ err }, '[MemoryModuleBuilder] Failed to load persisted TaskWorker config (using defaults)');
    });

    return this;
  }

  /** Load TaskWorker config overrides from config_changes DB table (non-blocking). */
  private async loadPersistedTaskWorkerConfig(worker: TaskWorker): Promise<void> {
    try {
      const { getDbAdapter } = await import('../../admin/db/core.js');
      const adapter = getDbAdapter();
      const rows = await adapter.allAsync<{ key: string; new_value: string }>(
        "SELECT key, new_value FROM config_changes WHERE section = 'taskWorker' ORDER BY changed_at DESC",
      );
      const patch: Record<string, number> = {};
      for (const row of rows) {
        if (!patch[row.key]) { patch[row.key] = parseInt(row.new_value, 10); }
      }
      if (Object.keys(patch).length > 0) {
        worker.updateConfig(patch as any);
        this.logger.info({ patch }, '[TaskWorker] Loaded persisted config from DB');
      }
    } catch { /* DB may not have config_changes table yet — use defaults */ }
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

  /** Step 6: Start background tier consolidation (non-blocking). */
  withConsolidation(): this {
    if (this.memAdapter) {
      const service = new TierConsolidationService(this.memAdapter);
      const interval = setInterval(() => {
        service.runConsolidation().catch((err: unknown) => {
          this.logger.warn({ err }, '[MemoryModuleBuilder] Consolidation cycle failed');
        });
      }, CONSOLIDATION_INTERVAL_MS);
      this.mod.setConsolidationInterval(interval);
    }
    return this;
  }

  /** Step 7: Kick off LLM initialization in background (non-blocking). */
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





