/**
 * Evolution dispatcher — SA4E-121 Instinct System handlers.
 * Extracted from evolution.ts: instinct confidence changes, instinct decay,
 * contradiction resolution and manual promotion.
 */

import type { MemoryEngine } from '../engine/core.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { InstinctPromotionService } from '../evolution/InstinctPromotionService.js';
import { ContradictionService } from '../evolution/ContradictionService.js';
import { errorJson, logger, type Args } from './evolution-shared.js';

/** Apply instinct-specific confidence boost/decay based on outcome. */
export async function applyInstinctConfidenceChange(
  adapter: DatabaseAdapter,
  entryId: number, currentConfidence: number, outcome: string,
  configSvc: InstinctConfigService,
): Promise<void> {
  const config = await configSvc.getInstinctConfig();
  const dialect = new DialectHelper(adapter.getEngine());
  let newConfidence: number;

  switch (outcome) {
    case 'success':
      newConfidence = Math.min(currentConfidence * config.instinct_boost_factor, config.instinct_confidence_ceiling);
      break;
    case 'partial':
      newConfidence = Math.min(currentConfidence * 1.05, config.instinct_confidence_ceiling);
      break;
    case 'fail':
      newConfidence = Math.max(currentConfidence * config.instinct_fail_factor, config.instinct_confidence_floor);
      break;
    default:
      return;
  }

  await adapter.runAsync(
    `UPDATE knowledge_entries SET confidence = ?, updated_at = ${dialect.now()} WHERE id = ?`,
    [newConfidence, entryId],
  );
}

/** Set instinct config values. */
export async function handleSetInstinctConfig(engine: MemoryEngine, a: Args): Promise<string> {
  const adapter = engine.getAdapter();
  const configSvc = new InstinctConfigService(adapter);
  const updates: Partial<Record<string, unknown>> = {};

  const keys = [
    'instinct_initial_confidence', 'instinct_confidence_floor', 'instinct_confidence_ceiling',
    'instinct_decay_rate', 'instinct_boost_factor', 'instinct_fail_factor',
    'instinct_access_threshold_days', 'instinct_promotion_threshold', 'contradiction_similarity_threshold',
  ];
  for (const key of keys) {
    if (a[key] !== undefined) updates[key] = a[key];
  }

  const result = await configSvc.setInstinctConfig(updates as any);
  return JSON.stringify(result);
}

/** Run instinct-specific decay cycle (separate from standard decay). */
export async function handleRunInstinctDecay(engine: MemoryEngine): Promise<string> {
  const adapter = engine.getAdapter();
  const configSvc = new InstinctConfigService(adapter);
  const config = await configSvc.getInstinctConfig();
  const dialect = new DialectHelper(adapter.getEngine());

  const threshold = new Date(
    Date.now() - config.instinct_access_threshold_days * 86_400_000,
  ).toISOString();

  const entries = await adapter.allAsync<{ id: number; confidence: number }>(`
    SELECT id, confidence FROM knowledge_entries
    WHERE (type = 'INSTINCT' OR tags LIKE '%instinct%')
      AND pinned = 0 AND archived = 0
      AND confidence > ?
      AND (last_accessed_at < ? OR last_accessed_at IS NULL)
    ORDER BY id
  `, [config.instinct_confidence_floor, threshold]);

  let decayed = 0;
  for (const entry of entries) {
    const newConf = Math.max(
      entry.confidence * (1 - config.instinct_decay_rate),
      config.instinct_confidence_floor,
    );
    if (newConf < entry.confidence) {
      await adapter.runAsync(
        `UPDATE knowledge_entries SET confidence = ?, updated_at = ${dialect.now()} WHERE id = ?`,
        [newConf, entry.id],
      );
      decayed++;
    }
  }

  return JSON.stringify({ instinct_decayed: decayed, total_checked: entries.length });
}

/** Resolve a contradiction via mem_verify action='resolve'. */
export async function handleResolveContradiction(engine: MemoryEngine, a: Args): Promise<string> {
  const contradictionId = a.contradiction_id as number | undefined;
  const resolution = a.resolution as string | undefined;
  if (!contradictionId || !resolution) {
    return errorJson('INVALID_RESOLUTION', 'contradiction_id and resolution required');
  }

  try {
    const adapter = engine.getAdapter();
    const configSvc = new InstinctConfigService(adapter);
    const svc = new ContradictionService(adapter, configSvc, logger);
    const result = await svc.resolveContradiction(contradictionId, resolution, a.resolved_by as string);
    return JSON.stringify(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorJson(msg, msg);
  }
}

/** Promote an instinct entry via mem_verify action='promote'. */
export async function handlePromoteInstinct(engine: MemoryEngine, a: Args): Promise<string> {
  const entryId = a.entry_id as number | undefined;
  if (!entryId) return errorJson('ENTRY_NOT_FOUND', 'entry_id is required');

  try {
    const adapter = engine.getAdapter();
    const configSvc = new InstinctConfigService(adapter);
    const svc = new InstinctPromotionService(adapter, configSvc, logger);
    const result = await svc.manualPromote(entryId);
    return JSON.stringify(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorJson('PROMOTION_FAILED', msg);
  }
}
