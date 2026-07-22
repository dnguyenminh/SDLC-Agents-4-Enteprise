/**
 * Evolution dispatcher — handles mem_outcome, mem_verify, mem_configure_decay tool calls.
 * SA4E-53: fully async — all services now use DatabaseAdapter.
 */

import type { MemoryEngine } from '../engine/core.js';
import { OutcomeService } from '../evolution/OutcomeService.js';
import { DecayService } from '../evolution/DecayService.js';
import { EpochService } from '../evolution/EpochService.js';
import { StagnationDetector } from '../evolution/StagnationDetector.js';
import pino from 'pino';

const logger = pino({ name: 'evolution-dispatcher' });

type Args = Record<string, unknown>;

export async function handleOutcome(engine: MemoryEngine, a: Args): Promise<string> {
  const entryId = a.entry_id as number | undefined;
  if (!entryId) return errorJson('INVALID_OUTCOME', 'entry_id is required');

  const outcome = a.outcome as string | undefined;
  if (!outcome) return errorJson('INVALID_OUTCOME', 'outcome is required');

  const agentName = a.agent_name as string | undefined;
  const context = a.context as string | undefined;

  try {
    const svc = new OutcomeService(engine.getAdapter());
    const result = await svc.record(entryId, outcome, agentName, context);
    return JSON.stringify({
      recorded: result.recorded,
      entry_id: entryId,
      new_outcome_factor: round(result.new_outcome_factor),
      total_outcomes: result.total_outcomes,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ entryId, outcome, err: msg }, 'Outcome recording failed');
    return errorJson(mapOutcomeCode(msg), msg);
  }
}

export async function handleVerify(engine: MemoryEngine, a: Args): Promise<string> {
  const entryId = a.entry_id as number | undefined;
  if (!entryId) return errorJson('ENTRY_NOT_FOUND', 'entry_id is required');

  const action = (a.action as string) ?? 'verify';
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

    default:
      return errorJson('INVALID_ACTION', `Unknown action: ${action}`);
  }
}

async function handleSetConfig(engine: MemoryEngine, a: Args): Promise<string> {
  const updates: Partial<Record<string, unknown>> = {};
  if (a.halfLifeDays !== undefined) updates.halfLifeDays = a.halfLifeDays;
  if (a.half_life_days !== undefined) updates.half_life_days = a.half_life_days;
  if (a.decayRate !== undefined) updates.decayRate = a.decayRate;
  if (a.decay_rate !== undefined) updates.decay_rate = a.decay_rate;
  if (a.confidenceFloor !== undefined) updates.confidenceFloor = a.confidenceFloor;
  if (a.confidence_floor !== undefined) updates.confidence_floor = a.confidence_floor;
  if (a.enable_predictive !== undefined) updates.enable_predictive = String(a.enable_predictive);

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

async function handleEpoch(engine: MemoryEngine, a: Args): Promise<string> {
  const scope = a.scope as string;
  const epochId = a.epoch_id as string;
  if (!scope || !epochId) {
    return errorJson('INVALID_CONFIG', 'scope and epoch_id required for epoch action');
  }
  const svc = new EpochService(engine.getAdapter(), logger);
  return JSON.stringify(await svc.trigger(scope, epochId));
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

function errorJson(code: string, message: string): string {
  return JSON.stringify({ error: code, message });
}

function mapOutcomeCode(msg: string): string {
  if (msg === 'ENTRY_NOT_FOUND') return 'ENTRY_NOT_FOUND';
  if (msg === 'INVALID_OUTCOME') return 'INVALID_OUTCOME';
  return 'OUTCOME_WRITE_FAILED';
}

function mapVerifyCode(msg: string): string {
  if (msg === 'ENTRY_NOT_FOUND') return 'ENTRY_NOT_FOUND';
  if (msg === 'NOT_FLAGGED') return 'NOT_FLAGGED';
  return 'VERIFY_FAILED';
}

function mapDecayCode(msg: string): string {
  if (msg === 'JOB_IN_PROGRESS') return 'JOB_IN_PROGRESS';
  if (msg.includes('INVALID')) return 'INVALID_CONFIG';
  return 'DECAY_ERROR';
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
