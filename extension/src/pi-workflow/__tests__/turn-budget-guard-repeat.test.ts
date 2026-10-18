/**
 * TurnBudgetGuard (repetition-based loop guard) — part 2: text-block repeats
 * + tool-failure signature ladder (Bug I) + steer/stop note builders.
 * Part 1 (core ladder/timeout) lives in turn-budget-guard.test.ts; the
 * read-target re-read guard lives in turn-budget-guard-reread.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TurnBudgetGuard,
  buildTextSteerCorrection,
  buildFailureSteerCorrection,
} from '../turn-budget-guard.js';

describe('TurnBudgetGuard (repetition-based loop guard)', () => {
  afterEach(() => {
    vi.useRealTimers();
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
