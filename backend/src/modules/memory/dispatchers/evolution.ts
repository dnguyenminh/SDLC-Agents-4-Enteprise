/**
 * Evolution dispatcher (facade) — handles mem_outcome, mem_verify,
 * mem_configure_decay tool calls.
 * SA4E-53: fully async — all services now use DatabaseAdapter.
 *
 * Implementation submodules (same directory):
 * - evolution-shared.ts  — logger, error JSON mapping
 * - evolution-decay.ts   — mem_configure_decay actions (SA4E-121 incl.)
 * - evolution-instinct.ts — instinct confidence/decay/promotion (SA4E-121)
 */

import type { MemoryEngine } from '../engine/core.js';
import { OutcomeService } from '../evolution/OutcomeService.js';
import { EpochService } from '../evolution/EpochService.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { InstinctPromotionService } from '../evolution/InstinctPromotionService.js';
import { errorJson, logger, mapOutcomeCode, mapVerifyCode, round, type Args } from './evolution-shared.js';
import { handleConfigureDecay } from './evolution-decay.js';
import {
  applyInstinctConfidenceChange, handleResolveContradiction, handlePromoteInstinct,
} from './evolution-instinct.js';

// Preserve the original public API at this module path.
export { handleConfigureDecay };
export type { Args } from './evolution-shared.js';

export async function handleOutcome(engine: MemoryEngine, a: Args): Promise<string> {
  const entryId = a.entry_id as number | undefined;
  if (!entryId) return errorJson('INVALID_OUTCOME', 'entry_id is required');

  const outcome = a.outcome as string | undefined;
  if (!outcome) return errorJson('INVALID_OUTCOME', 'outcome is required');

  const agentName = a.agent_name as string | undefined;
  const context = a.context as string | undefined;

  try {
    const adapter = engine.getAdapter();
    const svc = new OutcomeService(adapter);
    const result = await svc.record(entryId, outcome, agentName, context);

    // SA4E-121: Apply instinct-specific confidence change + check promotion
    let promoted = false;
    const entry = await adapter.getAsync<{ type: string; tags: string; confidence: number }>(
      'SELECT type, tags, confidence FROM knowledge_entries WHERE id = ?', [entryId],
    );
    if (entry && (entry.type === 'INSTINCT' || entry.tags.includes('instinct'))) {
      const configSvc = new InstinctConfigService(adapter);
      await applyInstinctConfidenceChange(adapter, entryId, entry.confidence, outcome, configSvc);
      // Check auto-promotion
      const promotionSvc = new InstinctPromotionService(adapter, configSvc, logger);
      const promoResult = await promotionSvc.checkAndPromote(entryId);
      promoted = promoResult.promoted;
    }

    return JSON.stringify({
      recorded: result.recorded,
      entry_id: entryId,
      new_outcome_factor: round(result.new_outcome_factor),
      total_outcomes: result.total_outcomes,
      promoted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ entryId, outcome, err: msg }, 'Outcome recording failed');
    return errorJson(mapOutcomeCode(msg), msg);
  }
}

export async function handleVerify(engine: MemoryEngine, a: Args): Promise<string> {
  const entryId = a.entry_id as number | undefined;
  const action = (a.action as string) ?? 'verify';

  // SA4E-121: Handle 'resolve' and 'promote' actions
  if (action === 'resolve') {
    return handleResolveContradiction(engine, a);
  }
  if (action === 'promote') {
    return handlePromoteInstinct(engine, a);
  }

  if (!entryId) return errorJson('ENTRY_NOT_FOUND', 'entry_id is required');
  const comment = a.comment as string | undefined;

  try {
    const svc = new EpochService(engine.getAdapter(), logger);
    if (action === 'reject') {
      await svc.reject(entryId, comment);
      return await buildVerifyResponse(engine, entryId);
    }
    await svc.verify(entryId, comment);
    return await buildVerifyResponse(engine, entryId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ entryId, action, err: msg }, 'Verify failed');
    return errorJson(mapVerifyCode(msg), msg);
  }
}

async function buildVerifyResponse(engine: MemoryEngine, entryId: number): Promise<string> {
  const entry = await engine.findById(entryId);
  return JSON.stringify({
    verified: true,
    entry_id: entryId,
    confidence: (entry as any)?.confidence ?? 0,
    needs_verification: (entry as any)?.needs_verification ?? 0,
  });
}
