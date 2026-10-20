/**
 * MemoryModuleBuilder — service wiring steps.
 * Extracted from MemoryModuleBuilder.ts: dispatcher, task worker (with
 * persisted config), promotion scheduler, consolidation and background LLM.
 */

import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { MemoryToolDispatcher } from './dispatchers/index.js';
import { ConvertToolResolver } from './ingest/ConvertToolResolver.js';
import { RegistryOrchestrationGateway } from './ingest/OrchestrationGateway.js';
import { QueryLayer } from '../../engine/query/query-layer.js';
import { ScopePromotionService } from './promotion/index.js';
import { TierConsolidationService } from './consolidation/service.js';
import { startScheduler } from './evolution/Scheduler.js';
import { TaskWorker } from './task-queue/TaskWorker.js';
import { initLLMInBackground } from './llm/LLMInitializer.js';
import type { BuilderConfig } from './MemoryModuleBuilder.js';
import type { MemoryModule } from './MemoryModule.js';

const PROMOTION_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;

/** Step 3: Wire MemoryToolDispatcher with all services. */
export function wireDispatcher(
  mod: MemoryModule, config: BuilderConfig, memAdapter: DatabaseAdapter | null,
  registry?: ModuleRegistry,
): void {
  const { workspace = '' } = config;
  const queryLayer = memAdapter ? new QueryLayer(memAdapter) : undefined;
  const dispatcher = new MemoryToolDispatcher(mod.engine, workspace, queryLayer);
  if (registry) {
    const gateway = new RegistryOrchestrationGateway(registry);
    const resolver = new ConvertToolResolver(gateway);
    dispatcher.setConvertResolver(resolver);
  }
  if (memAdapter) dispatcher.setDbAdapter(memAdapter);
  mod.setDispatcher(dispatcher);
}

/** Step 4: Set up task worker for background enrichment. */
export function startTaskWorker(
  mod: MemoryModule, logger: Logger, config: BuilderConfig,
  memAdapter: DatabaseAdapter | null,
): void {
  const injectd = mod.getInjectedDeps();
  const worker = injectd.taskWorker
    ? injectd.taskWorker
    : new TaskWorker(memAdapter!, mod.engine, logger, config.taskWorkerConfig);
  worker.start();
  mod.setTaskWorker(worker);

  // SA4E-107: Load persisted TaskWorker config from DB (Admin UI values survive restart)
  loadPersistedTaskWorkerConfig(worker, logger).catch(err => {
    logger.debug({ err }, '[MemoryModuleBuilder] Failed to load persisted TaskWorker config (using defaults)');
  });
}

/** Load TaskWorker config overrides from config_changes DB table (non-blocking). */
async function loadPersistedTaskWorkerConfig(worker: TaskWorker, logger: Logger): Promise<void> {
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
      logger.info({ patch }, '[TaskWorker] Loaded persisted config from DB');
    }
  } catch { /* DB may not have config_changes table yet — use defaults */ }
}

/** Step 5: Start scope promotion service + background scheduler. */
export function startPromotion(
  mod: MemoryModule, logger: Logger, memAdapter: DatabaseAdapter | null,
): void {
  const injectd = mod.getInjectedDeps();
  if (!injectd.promotionService && memAdapter) {
    // SA4E-53: ScopePromotionService now uses DatabaseAdapter
    const promotionService = new ScopePromotionService(memAdapter, logger);
    // Initialize table asynchronously (non-blocking)
    promotionService.ensurePromotionQueueTable().catch((err: unknown) => {
      logger.warn({ err }, '[MemoryModuleBuilder] promotion queue table init failed');
    });
    mod.dispatcher?.setPromotionService(promotionService);

    const interval = setInterval(() => {
      promotionService.runPromotionCycle().catch((err: unknown) => {
        logger.warn({ err }, 'Promotion cycle failed');
      });
    }, PROMOTION_SCAN_INTERVAL_MS);
    mod.setPromotionInterval(interval);
  } else if (injectd.promotionService) {
    mod.dispatcher?.setPromotionService(injectd.promotionService);
  }

  // Start decay/epoch scheduler — now uses adapter directly (all engines)
  if (mod.engine) {
    const handles = startScheduler(mod.engine.getAdapter(), logger);
    mod.setSchedulerHandles(handles);
  }
}

/** Step 6: Start background tier consolidation (non-blocking). */
export function startConsolidation(
  mod: MemoryModule, logger: Logger, memAdapter: DatabaseAdapter | null,
): void {
  if (memAdapter) {
    const service = new TierConsolidationService(memAdapter);
    const interval = setInterval(() => {
      service.runConsolidation().catch((err: unknown) => {
        logger.warn({ err }, '[MemoryModuleBuilder] Consolidation cycle failed');
      });
    }, CONSOLIDATION_INTERVAL_MS);
    mod.setConsolidationInterval(interval);
  }
}

/** Step 7: Kick off LLM initialization in background (non-blocking). */
export function startBackgroundLLM(mod: MemoryModule, logger: Logger): void {
  if (mod.taskWorker) {
    try {
      initLLMInBackground(mod.dispatcher!, mod.taskWorker, logger);
    } catch (err: unknown) {
      logger.warn({ err }, 'LLM init failed');
    }
  }
}
