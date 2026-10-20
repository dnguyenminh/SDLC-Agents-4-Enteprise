/**
 * Evolution dispatcher — decay configuration handlers (SA4E-53, SA4E-121).
 * Extracted from evolution.ts: mem_configure_decay action dispatch for
 * decay config, decay cycles, epochs, stagnation and instinct config.
 */

import type { MemoryEngine } from '../engine/core.js';
import { DecayService } from '../evolution/DecayService.js';
import { EpochService } from '../evolution/EpochService.js';
import { StagnationDetector } from '../evolution/StagnationDetector.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { errorJson, logger, mapDecayCode, type Args } from './evolution-shared.js';
import { handleSetInstinctConfig, handleRunInstinctDecay } from './evolution-instinct.js';

export async function handleConfigureDecay(engine: MemoryEngine, a: Args): Promise<string> {
  const action = a.action as string | undefined;
  if (!action) return errorJson('INVALID_ACTION', 'action is required');

  try {
    return await dispatchDecayAction(engine, action, a);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ action, err: msg }, 'Configure decay failed');
    return errorJson(mapDecayCode(msg), msg);
  }
}

async function dispatchDecayAction(engine: MemoryEngine, action: string, a: Args): Promise<string> {
  const adapter = engine.getAdapter();

  switch (action) {
    case 'get_config':
      return JSON.stringify(await new DecayService(adapter, logger).getConfig());

    case 'set_config':
      return await handleSetConfig(engine, a);

    case 'run_decay':
      return JSON.stringify(await new DecayService(adapter, logger).runDecayCycle());

    case 'epoch':
      return await handleEpoch(engine, a);

    case 'stagnation_check':
      return JSON.stringify(await new StagnationDetector(adapter, logger).analyze());

    // SA4E-121: Instinct-specific config actions
    case 'get_instinct_config':
      return JSON.stringify(await new InstinctConfigService(adapter).getInstinctConfig());

    case 'set_instinct_config':
      return await handleSetInstinctConfig(engine, a);

    case 'run_instinct_decay':
      return await handleRunInstinctDecay(engine);

    default:
      return errorJson('INVALID_ACTION', `Unknown action: ${action}`);
  }
}

async function handleSetConfig(engine: MemoryEngine, a: Args): Promise<string> {
  const updates = collectConfigUpdates(a);

  const adapter = engine.getAdapter();
  const dialect = engine.getDialect();
  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      await adapter.runAsync(
        `UPDATE decay_config SET value = ?, updated_at = ${dialect.now()} WHERE key = ?`,
        [String(val), key],
      );
    }
  }
  return JSON.stringify(await new DecayService(adapter, logger).getConfig());
}

/** Accept both camelCase and snake_case decay config keys. */
function collectConfigUpdates(a: Args): Partial<Record<string, unknown>> {
  const updates: Partial<Record<string, unknown>> = {};
  if (a.halfLifeDays !== undefined) updates.halfLifeDays = a.halfLifeDays;
  if (a.half_life_days !== undefined) updates.half_life_days = a.half_life_days;
  if (a.decayRate !== undefined) updates.decayRate = a.decayRate;
  if (a.decay_rate !== undefined) updates.decay_rate = a.decay_rate;
  if (a.confidenceFloor !== undefined) updates.confidenceFloor = a.confidenceFloor;
  if (a.confidence_floor !== undefined) updates.confidence_floor = a.confidence_floor;
  if (a.enable_predictive !== undefined) updates.enable_predictive = String(a.enable_predictive);
  return updates;
}

async function handleEpoch(engine: MemoryEngine, a: Args): Promise<string> {
  const scope = a.scope as string;
  const epochId = a.epoch_id as string;
  if (!scope || !epochId) {
    return errorJson('INVALID_CONFIG', 'scope and epoch_id required for epoch action');
  }
  const svc = new EpochService(engine.getAdapter(), logger);
  return JSON.stringify(await svc.trigger(scope, epochId));
}
