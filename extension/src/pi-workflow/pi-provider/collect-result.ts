/**
 * Result collection for one guarded prompt attempt (CHAT-LOOP-CONT split from
 * prompt-attempt.ts — BR-18 file-size standard).
 */
import type { Agent } from '@earendil-works/pi-agent-core';
import type { EventCollector } from '../pi-event-mapper.js';
import type { TurnBudgetGuard } from '../turn-budget-guard.js';
import { buildStopNote } from '../turn-budget-guard.js';
import { debugLog } from '../../debug-logger.js';
import type { PiRunResult } from '../pi-provider-types.js';

/** FIX E: snapshot the agent transcript + finalize chunks and error status. */
export function collectResult(agent: Agent, collector: EventCollector, guard?: TurnBudgetGuard): PiRunResult {
  // K2 (SA4E-368): a guard stop is INTENTIONAL — the abort error the SDK
  // records on the agent state ("This operation was aborted") must NOT
  // surface as a turn error: the friendly stop note appended below is the
  // single source of truth. Otherwise the executor maps it to
  // PI_EXECUTION_ERROR and the chat emits a SECOND red bubble on top of
  // the stop note (UAT: "Stopped early … loop guard" + "This operation
  // was aborted"). A genuine failure (no guard trip) still flows through.
  const errorMessage = guard?.stoppedReason
    ? undefined
    : collector.errorMessage || agent.state.errorMessage;
  let text = collector.text;
  if (guard?.stoppedReason) {
    const note = buildStopNote(guard.stoppedReason, guard.stats.totalCalls);
    text += note;
    // Stream the note too (the adapter renders chunks, not text).
    collector.chunks.push({ type: 'text', content: note });
    debugLog(`[PiProvider] turn stopped early (${guard.stoppedReason}, ${guard.stats.totalCalls} tool calls)`);
  }
  if (!collector.chunks.some(c => c.type === 'done')) {
    collector.chunks.push({ type: 'done' });
  }
  return {
    text,
    toolCalls: collector.toolCalls,
    chunks: collector.chunks,
    messages: agent.state.messages.slice(),
    errorMessage,
    stopReason: collector.stopReason,
  };
}
