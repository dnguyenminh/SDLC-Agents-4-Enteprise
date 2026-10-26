import { describe, it, expect, vi } from 'vitest';
import {
  createTruncationGuard,
  MAX_CONSECUTIVE_TRUNCATIONS,
  MAX_TOTAL_TRUNCATIONS,
  type SessionTurnHooks,
} from '../session-host/turn-guards.js';

/**
 * Chat-loop circuit breaker (turn-guards.ts).
 *
 * Reproduction baseline: the attached chat log — a model stuck in a
 * repetition spiral re-issued the same oversized `write` call 10 times;
 * pi-agent-core failed each with "was not executed: the response hit the
 * output token limit … Re-issue the tool call" and CONTINUED the loop, so
 * every ~11 minutes another full LLM request fired. The guard must abort
 * the session once the caps trip, and only then.
 */

const SDK_TRUNCATION_ERROR =
  'Tool call "write" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.';

function truncatedEnd(id: string): unknown {
  return {
    type: 'tool_execution_end',
    toolCallId: id,
    toolName: 'write',
    isError: true,
    result: { content: [{ type: 'text', text: SDK_TRUNCATION_ERROR }] },
  };
}

function okEnd(id: string): unknown {
  return { type: 'tool_execution_end', toolCallId: id, toolName: 'read', isError: false };
}

/** Pairing start event (the SDK emits it before the synthetic failure). */
function start(id: string): unknown {
  return { type: 'tool_execution_start', toolCallId: id, toolName: 'write', args: {} };
}

function makeSession(): { session: { abort: ReturnType<typeof vi.fn> }; hooks: SessionTurnHooks } {
  return { session: { abort: vi.fn(async () => undefined) }, hooks: { onToolEvent: vi.fn() } };
}

describe('TruncationGuard circuit breaker', () => {
  it('does not trip below the consecutive cap (model may recover after 1-2 truncated attempts)', () => {
    const { session, hooks } = makeSession();
    const guard = createTruncationGuard(session, hooks);
    for (let i = 0; i < MAX_CONSECUTIVE_TRUNCATIONS - 1; i++) {
      guard.observe(start(`t${i}`));
      guard.observe(truncatedEnd(`t${i}`));
    }
    expect(session.abort).not.toHaveBeenCalled();
    expect(hooks.onToolEvent).not.toHaveBeenCalled();
  });

  it('trips after MAX_CONSECUTIVE_TRUNCATIONS consecutive truncated calls: aborts session + notifies UI', () => {
    const { session, hooks } = makeSession();
    const guard = createTruncationGuard(session, hooks);
    for (let i = 0; i < MAX_CONSECUTIVE_TRUNCATIONS; i++) {
      guard.observe(start(`t${i}`));
      guard.observe(truncatedEnd(`t${i}`));
    }
    expect(session.abort).toHaveBeenCalledTimes(1);
    // UI notice renders as a start+end tool pair so the failed block always pairs.
    const events = (hooks.onToolEvent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(events[0]).toMatchObject({ phase: 'start', name: 'circuit-breaker' });
    expect(events[1]).toMatchObject({ phase: 'end', isError: true });
    expect(events[1].result).toContain('oversized');
  });

  it('a successful tool result resets the consecutive counter', () => {
    const { session, hooks } = makeSession();
    const guard = createTruncationGuard(session, hooks);
    guard.observe(truncatedEnd('a'));
    guard.observe(truncatedEnd('b'));
    guard.observe(okEnd('c')); // model recovered — small payload succeeded
    guard.observe(truncatedEnd('d'));
    guard.observe(truncatedEnd('e'));
    expect(session.abort).not.toHaveBeenCalled();
  });

  it('total cap still bounds alternating fail/success spirals', () => {
    const { session } = makeSession();
    const guard = createTruncationGuard(session, { onToolEvent: vi.fn() });
    // Alternation keeps the CONSECUTIVE counter at 1 (each success resets it),
    // so only the total cap can bound this pathological pattern.
    for (let i = 0; i < MAX_TOTAL_TRUNCATIONS - 1; i++) {
      guard.observe(truncatedEnd(`f${i}`));
      guard.observe(okEnd(`s${i}`));
      expect(session.abort).not.toHaveBeenCalled();
    }
    guard.observe(truncatedEnd('final')); // total reaches the cap → trip
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it('aborts exactly once — later events are ignored after the trip', () => {
    const { session, hooks } = makeSession();
    const guard = createTruncationGuard(session, hooks);
    for (let i = 0; i < MAX_CONSECUTIVE_TRUNCATIONS + 5; i++) {
      guard.observe(truncatedEnd(`t${i}`));
    }
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary tool errors (no output-limit marker)', () => {
    const { session, hooks } = makeSession();
    const guard = createTruncationGuard(session, hooks);
    for (let i = 0; i < 10; i++) {
      guard.observe({
        type: 'tool_execution_end',
        toolCallId: `e${i}`,
        isError: true,
        result: { content: [{ type: 'text', text: 'PEER_003: task failed' }] },
      });
    }
    expect(session.abort).not.toHaveBeenCalled();
  });

  it('is robust to malformed events (never throws)', () => {
    const { session } = makeSession();
    const guard = createTruncationGuard(session, {});
    expect(() => {
      guard.observe(null);
      guard.observe(undefined);
      guard.observe({ type: 'tool_execution_end' });
      guard.observe({ type: 'other', isError: true, result: 'x' });
    }).not.toThrow();
    expect(session.abort).not.toHaveBeenCalled();
  });
});
