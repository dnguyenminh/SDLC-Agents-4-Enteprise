import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TurnBudgetGuard,
  buildStopNote,
  buildSteerCorrection,
  buildFailureSteerCorrection,
  buildTextSteerCorrection,
  splitCompletedBlocks,
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

  it('observeTextBlock ignores short blocks, steers then aborts on repeats', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 3 }),
      onAbort
    );
    expect(guard.observeTextBlock('hi')).toBe('ok');
    expect(guard.observeTextBlock('ok')).toBe('ok');
    const para = 'Tôi sẽ review toàn bộ project bằng cách liệt kê mọi file cần thiết.';
    expect(guard.observeTextBlock(para)).toBe('ok');
    expect(guard.observeTextBlock('Some other long enough paragraph here yes.')).toBe('ok');
    expect(guard.observeTextBlock(para)).toBe('ok');
    expect(guard.observeTextBlock(para)).toBe('steer');
    expect(guard.stoppedReason).toBeUndefined();
    expect(guard.observeTextBlock(para)).toBe('ok');
    expect(guard.observeTextBlock(para)).toBe('ok');
    expect(guard.observeTextBlock(para)).toBe('abort');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('tool and text signatures do not collide', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 10 }),
      onAbort
    );
    for (let i = 0; i < 9; i++) {
      expect(guard.observeToolCall('read', '{"p":"a"}')).toBe('ok');
      expect(guard.observeTextBlock('A sufficiently long paragraph number ' + i + ' xx.')).toBe('ok');
    }
    expect(guard.stoppedReason).toBeUndefined();
  });

  it('buildTextSteerCorrection tells the model to continue with new content', () => {
    const msg = buildTextSteerCorrection(4);
    expect(msg).toContain('4');
    expect(msg).toContain('get_workspace_info');
  });

  it('observeToolFailure steers then aborts on the same error even when args vary (Bug I)', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 3 }),
      onAbort
    );
    const err = "dir: cannot access '/b': No such file or directory\nCommand exited with code 2";
    // Args differ every time (identical-args signature never trips)…
    expect(guard.observeToolCall('bash', '{"command":"dir /b a"}')).toBe('ok');
    expect(guard.observeToolCall('bash', '{"command":"dir /b b"}')).toBe('ok');
    expect(guard.observeToolCall('bash', '{"command":"dir /b c"}')).toBe('ok');
    // …but the identical FAILURE signature counts: steer on the 3rd.
    expect(guard.observeToolFailure('bash', err)).toBe('ok');
    expect(guard.observeToolFailure('bash', err)).toBe('ok');
    expect(guard.observeToolFailure('bash', err)).toBe('steer');
    expect(guard.stoppedReason).toBeUndefined();
    expect(onAbort).not.toHaveBeenCalled();
    // Persists after correction: 3 more identical failures → abort.
    expect(guard.observeToolFailure('bash', err)).toBe('ok');
    expect(guard.observeToolFailure('bash', err)).toBe('ok');
    expect(guard.observeToolFailure('bash', err)).toBe('abort');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('observeToolFailure keys only the first error line (multi-line errors collapse)', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    expect(guard.observeToolFailure('bash', 'dir: cannot access /b\nline2 a')).toBe('ok');
    expect(guard.observeToolFailure('bash', 'dir: cannot access /b\nline2 b')).toBe('steer');
    expect(guard.stoppedReason).toBeUndefined();
  });

  it('observeToolFailure without error text keys on the tool name only', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    expect(guard.observeToolFailure('bash')).toBe('ok');
    expect(guard.observeToolFailure('bash')).toBe('steer');
    expect(guard.stoppedReason).toBeUndefined();
  });

  it('failure signatures are independent per tool name', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    expect(guard.observeToolFailure('bash', 'same error')).toBe('ok');
    expect(guard.observeToolFailure('grep', 'same error')).toBe('ok');
    expect(guard.observeToolFailure('bash', 'same error')).toBe('steer');
    expect(guard.observeToolFailure('grep', 'same error')).toBe('steer');
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('buildFailureSteerCorrection names the tool, shell dialect and alternatives', () => {
    const msg = buildFailureSteerCorrection('bash', 4);
    expect(msg).toContain('bash');
    expect(msg).toContain('4');
    expect(msg).toContain('Git Bash');
    expect(msg).toContain('dir /b');
    expect(msg).toContain('ls/read/grep/find');
    expect(msg).toContain('STOP');
  });

  it('TC-07: buildFailureSteerCorrection gives PowerShell dialect for powershell', () => {
    const msg = buildFailureSteerCorrection('powershell', 3);
    expect(msg).toContain('powershell');
    expect(msg).toContain('3');
    expect(msg).toContain('Get-ChildItem');
    expect(msg).toContain('Get-Content');
    expect(msg).toContain('c:\\'); // Windows paths work as-is
    expect(msg).not.toContain('Git Bash');
    expect(msg).toContain('STOP');
  });

  it('generic tool gets neutral correction (no shell dialect)', () => {
    const msg = buildFailureSteerCorrection('find', 5);
    expect(msg).toContain('find');
    expect(msg).toContain('change approach');
    expect(msg).not.toContain('PowerShell');
    expect(msg).not.toContain('Git Bash');
  });
});

describe('splitCompletedBlocks', () => {
  it('splits paragraphs on blank lines, drops trailing partial', () => {
    expect(splitCompletedBlocks('')).toEqual([]);
    expect(splitCompletedBlocks('only partial, no blank')).toEqual([]);
    expect(splitCompletedBlocks('para one.\n\npara two.\n\npartial')).toEqual([
      'para one.',
      'para two.',
    ]);
  });

  it('treats a closed fence as one atomic block', () => {
    const text = 'intro\n\n```bash\nls -la\n\nls src/\n```\n\noutro partial';
    expect(splitCompletedBlocks(text)).toEqual(['intro', '```bash\nls -la\n\nls src/\n```']);
  });

  it('never yields lines inside an unclosed fence', () => {
    const text = 'done.\n\n```bash\nls -la\n\nstill streaming...';
    expect(splitCompletedBlocks(text)).toEqual(['done.']);
  });

  it('skips oversized text', () => {
    expect(splitCompletedBlocks('x'.repeat(100_001))).toEqual([]);
  });
});
