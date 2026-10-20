/**
 * MemoryModuleBuilder (facade) — fluent builder for MemoryModule initialization.
 * Builder pattern: decomposes the initialize() flow into focused steps.
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
 *
 * Implementation submodules (same directory):
 * - memory-db-bootstrap.ts    — adapter resolution + migrations + FTS
 * - memory-services-wiring.ts — dispatcher/task worker/promotion/LLM wiring
 */

import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { MemoryEngine } from './engine/index.js';
import type { TaskWorkerConfig } from './task-queue/TaskWorkerConfig.js';
import {
  openMemoryDatabase, rebuildFtsIfNeeded,
} from './memory-db-bootstrap.js';
import {
  wireDispatcher, startTaskWorker, startPromotion,
  startConsolidation, startBackgroundLLM,
} from './memory-services-wiring.js';
import type { MemoryModule } from './MemoryModule.js';

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
  async withDatabase(): Promise<this> {
    this.memAdapter = await openMemoryDatabase(this.mod, this.logger, this.config);
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
    if (this.memAdapter) {
      await rebuildFtsIfNeeded(this.memAdapter, this.logger);
    }
    return this;
  }

  /** Step 3: Wire MemoryToolDispatcher with all services. */
  withDispatcher(registry?: ModuleRegistry): this {
    wireDispatcher(this.mod, this.config, this.memAdapter, registry);
    return this;
  }

  /** Step 4: Set up task worker for background enrichment. */
  withTaskWorker(): this {
    startTaskWorker(this.mod, this.logger, this.config, this.memAdapter);
    return this;
  }

  /** Step 5: Start scope promotion service + background scheduler. */
  withPromotion(): this {
    startPromotion(this.mod, this.logger, this.memAdapter);
    return this;
  }

  /** Step 6: Start background tier consolidation (non-blocking). */
  withConsolidation(): this {
    startConsolidation(this.mod, this.logger, this.memAdapter);
    return this;
  }

  /** Step 7: Kick off LLM initialization in background (non-blocking). */
  withBackgroundLLM(): this {
    startBackgroundLLM(this.mod, this.logger);
    return this;
  }

  /** Finalize: mark module as ready. */
  build(): void {
    this.mod.setStatus('ready');
    this.logger.info('Memory module ready');
  }
}
