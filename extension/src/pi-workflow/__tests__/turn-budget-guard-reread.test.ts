/**
 * read-target re-read guard (SA4E-368 — "review all files" re-read loop) +
 * splitCompletedBlocks. The repetition-based ladder suites live in
 * turn-budget-guard.test.ts / turn-budget-guard-repeat.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TurnBudgetGuard,
  buildSteerCorrection,
  buildTextSteerCorrection,
  buildFailureSteerCorrection,
  buildRereadSteerCorrection,
  extractReadTarget,
  splitCompletedBlocks,
} from '../turn-budget-guard.js';

describe('read-target re-read guard (SA4E-368 — "review all files" re-read loop)', () => {
  it('steers then aborts when the SAME target is re-read with VARYING args', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 3 }),
      onAbort
    );
    // Same file, different offset/limit every time — the identical-args
    // signature NEVER trips (args differ); only the read-target ladder can.
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":0,"limit":100}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":100,"limit":100}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":200,"limit":50}')).toBe('steer');
    expect(guard.lastTripKind).toBe('reread');
    expect(guard.lastTripTarget).toBe('src/a.ts');
    expect(guard.stoppedReason).toBeUndefined();
    expect(onAbort).not.toHaveBeenCalled();
    // Persists after correction → abort.
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":300,"limit":100}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":400,"limit":100}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"file_path":"src/a.ts","offset":500,"limit":100}')).toBe('abort');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('DISTINCT targets never trip, however many', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults({}), onAbort);
    for (let i = 0; i < 50; i++) {
      expect(guard.observeToolCall('read', `{"file_path":"src/file${i}.ts"}`)).toBe('ok');
    }
    expect(guard.stoppedReason).toBeUndefined();
    expect(guard.stats.totalCalls).toBe(50);
  });

  it('args without a recognizable target field fall back to the identical-args ladder', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    expect(guard.observeToolCall('read', '{"p":"a"}')).toBe('ok');
    expect(guard.observeToolCall('read', '{"p":"a"}')).toBe('steer');
    expect(guard.lastTripKind).toBe('identical');
    expect(guard.lastTripTarget).toBeUndefined();
  });

  it('malformed args JSON falls back to the raw-args ladder without throwing', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(
      TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }),
      onAbort
    );
    const bad = '{"file_path":"src/a.ts'; // truncated JSON — must not throw
    expect(guard.observeToolCall('read', bad)).toBe('ok');
    expect(guard.observeToolCall('read', bad)).toBe('steer');
  });

  it('sweep tools (grep) do NOT trip on the same pattern across DIFFERENT paths — that is legitimate exploration', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults({ maxSameToolRepeats: 2 }), onAbort);
    for (let i = 0; i < 6; i++) {
      expect(guard.observeToolCall('grep', `{"pattern":"TODO","path":"src/folder${i}"}`)).toBe('ok');
    }
    expect(guard.stoppedReason).toBeUndefined();
    // Identical grep args still trip via the identical-args ladder.
    expect(guard.observeToolCall('grep', '{"pattern":"TODO","path":"src/a","limit":10}')).toBe('ok');
    expect(guard.observeToolCall('grep', '{"pattern":"TODO","path":"src/a","limit":10}')).toBe('steer');
    expect(guard.lastTripKind).toBe('identical');
  });

  it('extractReadTarget reads file_path ?? path ?? pattern ?? glob; junk tolerated', () => {
    expect(extractReadTarget('{"file_path":"src/a.ts"}')).toBe('src/a.ts');
    expect(extractReadTarget('{"path":"src"}')).toBe('src');
    expect(extractReadTarget('{"pattern":"TODO"}')).toBe('TODO');
    expect(extractReadTarget('{"glob":"**/*.ts"}')).toBe('**/*.ts');
    expect(extractReadTarget('{"offset":5}')).toBe('');
    expect(extractReadTarget('not json')).toBe('');
    expect(extractReadTarget('')).toBe('');
  });

  it('buildRereadSteerCorrection names the target and pushes synthesis — never more exploration', () => {
    const msg = buildRereadSteerCorrection('read', 'src/a.ts', 3);
    expect(msg).toContain('src/a.ts');
    expect(msg).toContain('3');
    expect(msg).toContain('STOP');
    expect(msg).toContain('ynthesi'); // synthesize the answer from what you have
    // The re-read steer must NOT push the model into MORE exploration —
    // that advice feeds the exact loop it is supposed to break.
    expect(msg).not.toContain('get_workspace_info');
  });

  it('buildTextSteerCorrection offers the synthesis escape hatch for review loops', () => {
    const msg = buildTextSteerCorrection(4);
    expect(msg).toContain('4');
    expect(msg).toContain('get_workspace_info'); // still helps the stuck-exploration case
    expect(msg).toContain('deliver'); // …but a review loop must deliver NOW
    expect(msg.toLowerCase()).toContain('never re-read');
  });

  // v1.53.7 (UAT 17/10): the model read a steer as "end the turn" and wrapped
  // up a review after 20/2342 files. Every steer must say: correction ≠ stop.
  it('every steer correction states it is NOT a signal to end the turn', () => {
    const corrections = [
      buildSteerCorrection('ls', 4),
      buildFailureSteerCorrection('ls', 4),
      buildTextSteerCorrection(4),
      buildRereadSteerCorrection('read', 'src/a.ts', 3),
    ];
    for (const msg of corrections) {
      expect(msg.toUpperCase()).toContain('NOT A SIGNAL TO END THE TURN');
    }
  });

  it('buildFailureSteerCorrection gives the one-level-off __tests__ fix for ls', () => {
    const msg = buildFailureSteerCorrection('ls', 5);
    expect(msg).toContain("'ls'");
    expect(msg).toContain('5');
    expect(msg).toContain('__tests__');
    expect(msg).toContain('read');
    expect(msg).toContain('PARENT folder');
  });

  it('tripNow trips the guard like an internal detection (reason + abort + once)', () => {
    const onAbort = vi.fn();
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults({}), onAbort);
    expect(guard.stoppedReason).toBeUndefined();
    guard.tripNow('repeat');
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
    guard.tripNow('timeout'); // second trip is a no-op (first trip wins)
    expect(guard.stoppedReason).toBe('repeat');
    expect(onAbort).toHaveBeenCalledTimes(1);
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
