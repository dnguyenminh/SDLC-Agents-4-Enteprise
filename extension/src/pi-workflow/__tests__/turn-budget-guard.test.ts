import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TurnBudgetGuard,
  buildStopNote,
  buildSteerCorrection,
  DEFAULT_MAX_SAME_TOOL_REPEATS,
  DEFAULT_TURN_TIMEOUT_MS,
} from '../turn-budget-guard.js';

describe('TurnBudgetGuard (repetition-based loop guard)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves defaults and clamps N into range', () => {
    expect(TurnBudgetGuard.resolveDefaults(undefined)).toEqual({
      timeoutMs: DEFAULT_TURN_TIMEOUT_MS,
      maxSameToolRepeats: DEFAULT_MAX_SAME_TOOL_REPEATS,
    });
    expect(TurnBudgetGuard.resolveDefaults({ timeoutMs: -5 }).timeoutMs).toBe(
      DEFAULT_TURN_TIMEOUT_MS
    );
    // Below minimum falls back to default; above cap is clamped.
    expect(TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 1 }).maxSameToolRepeats).toBe(
      DEFAULT_MAX_SAME_TOOL_REPEATS
    );
    expect(TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 99 }).maxSameToolRepeats).toBe(20);
  });

  it('never trips on varied calls, however many', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults({}), onAbort);
    for (let i = 0; i < 50; i++) {
      expect(guard.observeToolCall('read', `{"p":"file${i}.ts"}`)).toBe('ok');
    }
    expect(guard.stoppedReason).toBeUndefined();
    expect(onAbort).not.toHaveBeenCalled();
    expect(guard.stats.totalCalls).toBe(50);
  });

  it('steers on first repeat, aborts only on persistence after correction', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 3 }),
      onAbort
    );
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"p":"a"}')).toBe('ok');
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('ok');
    // 3rd identical call: steer (turn stays alive), no abort, no stop reason.
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('steer');
    expect(guard.stoppedReason).toBeUndefined();
    expect(onAbort).not.toHaveBeenCalled();
    // Persists after correction: 3 more identical → abort.
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('ok');
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('ok');
    expect(guard.observeToolCall('bash', '{"cmd":"ls"}')).toBe('abort');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('trips on timeout and aborts exactly once', () => {
    vi.useFakeTimers();
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ timeoutMs: 1000 }),
      onAbort
    );
    guard.startTimeout();
    vi.advanceTimersByTime(999);
    expect(guard.stoppedReason).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(guard.stoppedReason).toBe('timeout');
    expect(onAbort).toHaveBeenCalledTimes(1);
    guard.clear();
  });

  it('does NOT arm a wall-clock timeout when timeoutMs <= 0 (repeat-only mode)', () => {
    vi.useFakeTimers();
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ timeoutMs: 0 }),
      onAbort
    );
    guard.startTimeout();
    // Advance far beyond any legacy default — must never trip on time.
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(guard.stoppedReason).toBeUndefined();
    expect(onAbort).not.toHaveBeenCalled();
    guard.clear();
  });

  it('repeat guard still trips with the wall-clock timeout disabled (timeoutMs=0)', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ timeoutMs: 0, maxSameToolRepeats: 2 }),
      onAbort
    );
    guard.startTimeout(); // disabled — no timer armed
    // N=2 ladder: 2nd → steer (reset), then 2 more → abort.
    expect(guard.observeToolCall('a', '{}')).toBe('ok');
    expect(guard.observeToolCall('a', '{}')).toBe('steer');
    expect(guard.observeToolCall('a', '{}')).toBe('ok');
    expect(guard.observeToolCall('a', '{}')).toBe('abort');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
    guard.clear();
  });

  it('default budget disables the wall-clock timeout (DEFAULT_TURN_TIMEOUT_MS === 0)', () => {
    expect(DEFAULT_TURN_TIMEOUT_MS).toBe(0);
    vi.useFakeTimers();
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults(undefined), onAbort);
    guard.startTimeout();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(guard.stoppedReason).toBeUndefined();
    guard.clear();
  });

  it('observes nothing more after abort', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    expect(guard.observeToolCall('a', '{}')).toBe('ok');
    expect(guard.observeToolCall('a', '{}')).toBe('steer');
    expect(guard.observeToolCall('a', '{}')).toBe('ok');
    expect(guard.observeToolCall('a', '{}')).toBe('abort');
    expect(guard.observeToolCall('a', '{}')).toBe('abort');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('buildStopNote explains repeat/timeout with partial-results guidance', () => {
    for (const reason of ['repeat', 'timeout'] as const) {
      const note = buildStopNote(reason, 31);
      expect(note).toContain('31');
      expect(note).toContain('Partial results');
    }
  });

  it('buildSteerCorrection names the stuck tool and the concrete alternative', () => {
    const msg = buildSteerCorrection('bash', 4);
    expect(msg).toContain('bash');
    expect(msg).toContain('get_workspace_info');
    expect(msg).toContain('STOP');
  });
});
