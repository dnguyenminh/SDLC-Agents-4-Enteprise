/**
 * Turn-level guards for the AgentSession host.
 *
 * SessionTurnHooks — per-turn streaming callbacks (token / live tool event /
 * reasoning deltas); shared by the turn executor and the guard below.
 *
 * TruncationGuard — circuit breaker for the output-limit truncation loop.
 * When an assistant response hits the output token limit mid-tool-call,
 * pi-agent-core fails the call with "Re-issue the tool call with complete
 * arguments." and CONTINUES the agent loop (agent-loop.ts
 * failToolCallsFromTruncatedMessage). A model stuck in a repetition spiral
 * (observed: 10 identical oversized `write` attempts, ~11 min each — every
 * iteration a full LLM request) then re-issues the same oversized call
 * forever. The guard counts truncated tool results per session.prompt() and
 * ABORTS the session once the caps trip, so the turn settles instead of
 * burning LLM requests. Aborting (never throwing) keeps the turn on the
 * session path — a throw would fall the turn back to the legacy engine and
 * re-run it against the LLM (double execution).
 */
import { extractToolResultText, type ToolLiveEvent } from '../pi-event-mapper.js';
import { logger } from '../../logger.js';

/** Per-turn streaming callbacks (token / live tool event / reasoning deltas). */
export interface SessionTurnHooks {
  onToken?: (t: string) => void;
  onToolEvent?: (e: ToolLiveEvent) => void;
  onThinking?: (t: string) => void;
}

/** Consecutive truncated tool failures before the guard trips. */
export const MAX_CONSECUTIVE_TRUNCATIONS = 3;
/** Per-turn total cap — bounds alternating fail/success spirals. */
export const MAX_TOTAL_TRUNCATIONS = 6;

const MARKER_NOT_EXECUTED = 'was not executed';
const MARKER_OUTPUT_LIMIT = 'hit the output token limit';

/** True only for the SDK's synthetic truncated-tool-call failure result. */
function isTruncatedToolResult(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const e = event as { type?: unknown; isError?: unknown; result?: unknown };
  if (e.type !== 'tool_execution_end' || e.isError !== true) return false;
  const text = extractToolResultText(e.result) ?? '';
  return text.includes(MARKER_NOT_EXECUTED) && text.includes(MARKER_OUTPUT_LIMIT);
}

export interface TruncationGuard {
  observe(event: unknown): void;
}

/** Surfaces the trip as a failed tool block in the chat UI (start+end pair). */
function notifyTrip(hooks: SessionTurnHooks, reason: string): void {
  const id = `circuit-breaker-${Date.now()}`;
  const message =
    `Turn aborted: ${reason} oversized (output-token-limit truncated) tool calls. ` +
    'The model is stuck re-issuing the same oversized request — narrow the payload or continue in a new message.';
  try {
    hooks.onToolEvent?.({ phase: 'start', id, name: 'circuit-breaker', args: { reason } });
    hooks.onToolEvent?.({ phase: 'end', id, name: 'circuit-breaker', isError: true, result: message });
  } catch { /* notification must never break the guard */ }
}

/**
 * Circuit breaker over one session.prompt() pump. A successful tool result
 * resets the consecutive counter (the model may legitimately recover after
 * one truncated attempt), while the total cap still bounds alternation.
 */
export function createTruncationGuard(session: unknown, hooks: SessionTurnHooks): TruncationGuard {
  let consecutive = 0;
  let total = 0;
  let tripped = false;
  const trip = (reason: string): void => {
    tripped = true;
    logger.warn(`[SessionHost] truncation circuit breaker tripped (${reason}) — aborting the turn to stop the request loop.`);
    notifyTrip(hooks, reason);
    try {
      void (session as { abort?: () => Promise<void> }).abort?.();
    } catch { /* best-effort: the SDK settles aborted runs, never throws */ }
  };
  return {
    observe(event) {
      if (tripped) return;
      if (!isTruncatedToolResult(event)) {
        const e = event as { type?: unknown; isError?: unknown };
        if (e?.type === 'tool_execution_end' && e.isError === false) consecutive = 0;
        return;
      }
      consecutive++;
      total++;
      if (consecutive >= MAX_CONSECUTIVE_TRUNCATIONS) trip(`${consecutive} consecutive`);
      else if (total >= MAX_TOTAL_TRUNCATIONS) trip(`${total} total`);
    },
  };
}
