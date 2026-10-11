import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../logger';
import { MIN_RESERVE_TOKENS } from '../../mcp/context-budget';
import {
  DEFAULT_MODEL_REGISTRY,
  DEFAULT_MODEL_REGISTRY_ENTRIES,
  ModelRegistry,
} from '../model-registry';
import {
  DEFAULT_CONTEXT_WINDOW,
  resolveContextBudget,
} from '../context-budget-resolver';

// STC: STC-001 — Resolver returns exact budget for detected qwen 32k (UC-01, BR-01/02/03)
// STC: STC-002 — reserveOutput resolution order: override → registry → floor 2000 (OI-2)
// STC: STC-003 — safetyMargin 8% ceil formula at 8k and 128k (BR-02)
// STC: STC-004 — static 70% / history 30% split with exact-sum invariant (BR-03)
// STC: STC-005 — qwen registry entry present and valid (BR-14)
//   NOTE: STC-005 lists model-registry.test.ts; Task 1 file ownership restricts new
//   suites to context-budget-resolver.test.ts, so the assertions live here.
// STC: STC-100 — Detection fails → registry fallback with warning log (UC-01 AF-1)
// STC: STC-101 — Registry miss → terminal default 8192, never 0 (UC-01 AF-2)
// STC: STC-200 — Invalid detected n_ctx (0/-1/NaN/Infinity): chain skips, never 0 (UC-01 EF-1)
// STC: STC-201 — Tiny model (2048): usable clamped, resolver does not throw (UC-01 EF-2)
// STC: STC-111 — 65,536 budget scales automatically (resolver math, UT level)

describe('resolveContextBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('STC-001: returns exact budget for detected qwen 32k', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });

    // safety = ceil(32768 × 0.08) = ceil(2621.44) = 2622; usable = 28098;
    // static = floor(28098 × 0.70) = 19668; history = exact remainder 8430.
    expect(budget).toEqual({
      nCtx: 32768,
      reserveOutput: 2048,
      safetyMargin: 2622,
      staticBudget: 19668,
      historyBudget: 8430,
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Context budget resolved',
      expect.objectContaining({
        modelId: 'qwen',
        source: 'provider',
        nCtx: 32768,
        reserveOutput: 2048,
        safetyMargin: 2622,
        staticBudget: 19668,
        historyBudget: 8430,
      })
    );
  });

  it('STC-002: reserveOutput order — override → registry maxOutput → floor 2000', () => {
    // (a) no override, no detection → registry maxOutput (qwen 2048)
    expect(resolveContextBudget({ modelId: 'qwen' }).reserveOutput).toBe(2048);
    // (b) explicit override wins
    expect(resolveContextBudget({ modelId: 'qwen', reserveOutput: 5000 }).reserveOutput).toBe(5000);
    // (c) override below floor is floored up to MIN_RESERVE_TOKENS
    expect(resolveContextBudget({ modelId: 'qwen', reserveOutput: 100 }).reserveOutput).toBe(2000);
    // (d) registry miss → floor
    expect(resolveContextBudget({ modelId: 'llama-unknown' }).reserveOutput).toBe(2000);
    expect(MIN_RESERVE_TOKENS).toBe(2000);
  });

  it('STC-003: safetyMargin = ceil(nCtx × 0.08) at 8k and 128k', () => {
    const at8k = resolveContextBudget({ modelId: 'llama3.1', nCtxDetected: 8192 });
    expect(at8k.safetyMargin).toBe(656); // ceil(655.36)

    const at128k = resolveContextBudget({ modelId: 'gpt-4o-mini', nCtxDetected: 128000 });
    expect(at128k.safetyMargin).toBe(10240); // exact 8% of 128,000
  });

  it('STC-004: 128k split — static 70% / history 30% sums exactly to usable', () => {
    const budget = resolveContextBudget({ modelId: 'gpt-4o-mini', nCtxDetected: 128000 });

    expect(budget).toEqual({
      nCtx: 128000,
      reserveOutput: 16384, // registry maxOutput
      safetyMargin: 10240,
      staticBudget: 70963, // floor(101376 × 0.70) = floor(70963.2)
      historyBudget: 30413,
    });
    const usable = budget.nCtx - budget.reserveOutput - budget.safetyMargin;
    expect(usable).toBe(101376);
    expect(budget.staticBudget + budget.historyBudget).toBe(usable);
  });

  it('STC-005: qwen registry entry present, valid; qwen2.5-coder unchanged (BR-14)', () => {
    const entry = DEFAULT_MODEL_REGISTRY.get('qwen');
    expect(entry).toEqual({
      modelId: 'qwen',
      contextWindow: 32768,
      maxOutput: 2048,
      costPer1k: 0,
      speed: 'medium',
      thinkingMap: { low: 256, medium: 512, high: 1024 },
    });
    expect(ModelRegistry.validate(entry!)).toBe(true);

    // Additive change only — existing qwen2.5-coder (32768/1024) untouched
    const coder = DEFAULT_MODEL_REGISTRY.get('qwen2.5-coder');
    expect(coder?.contextWindow).toBe(32768);
    expect(coder?.maxOutput).toBe(1024);
    expect(DEFAULT_MODEL_REGISTRY_ENTRIES.some((e) => e.modelId === 'qwen2.5-coder')).toBe(true);
  });

  it('STC-100: detection fails → registry fallback + PI_CONTEXT_DETECT_FALLBACK warn', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: undefined });

    // Registry path yields the identical budget as the detected path for qwen
    expect(budget).toEqual({
      nCtx: 32768,
      reserveOutput: 2048,
      safetyMargin: 2622,
      staticBudget: 19668,
      historyBudget: 8430,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'PI_CONTEXT_DETECT_FALLBACK',
      expect.objectContaining({ modelId: 'qwen' })
    );
  });

  it('STC-101: registry miss → terminal default 8192 (never 0)', () => {
    const budget = resolveContextBudget({ modelId: 'llama-unknown' });

    expect(DEFAULT_CONTEXT_WINDOW).toBe(8192);
    expect(budget).toEqual({
      nCtx: 8192,
      reserveOutput: 2000, // registry miss → MIN_RESERVE_TOKENS floor
      safetyMargin: 656,
      staticBudget: 3875, // floor(5536 × 0.70) = floor(3875.2)
      historyBudget: 1661,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'PI_CONTEXT_DETECT_DEFAULT',
      expect.objectContaining({ modelId: 'llama-unknown' })
    );
  });

  it('STC-200: invalid detected n_ctx (0/-1/NaN/Infinity) — chain skips, never 0 (BR-01)', () => {
    // 0 is invalid → registry fallback (qwen)
    const zero = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 0 });
    expect(zero.nCtx).toBe(32768);
    expect(zero.nCtx).toBeGreaterThan(0);

    // -1 / NaN / Infinity with registry miss → default 8192 (aggregate BR-01 guarantee)
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const budget = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: invalid });
      expect(budget.nCtx).toBe(8192);
      expect(Number.isFinite(budget.nCtx)).toBe(true);
      expect(Number.isInteger(budget.nCtx)).toBe(true);
      expect(budget.nCtx).toBeGreaterThan(0);
    }
  });

  it('STC-201: tiny model (2048) — usable clamped to positive floor, no throw (EF-2)', () => {
    const budget = resolveContextBudget({ modelId: 'phi-3-mini', nCtxDetected: 2048 });

    expect(budget).toEqual({
      nCtx: 2048,
      reserveOutput: 2000, // registry maxOutput 512 floored up to 2000
      safetyMargin: 164, // ceil(163.84)
      staticBudget: 0, // floor(1 × 0.70)
      historyBudget: 1, // usable clamped: max(2048−2000−164, 1) = 1
    });
  });

  it('STC-111: 65,536 budget scales automatically (ceil/floor edge values)', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 65536 });

    expect(budget).toEqual({
      nCtx: 65536,
      reserveOutput: 2048,
      safetyMargin: 5243, // ceil(5242.88)
      staticBudget: 40771, // floor(40771.5)
      historyBudget: 17474,
    });
  });
});
