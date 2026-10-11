import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { resolveContextBudget } from '../context-budget-resolver';

// STC: STC-300 — [PBT] BR-01 invariant: resolved nCtx always > 0, finite, integer
// STC: STC-301 — [PBT] BR-02: safetyMargin === ceil(nCtx × 0.08) for all nCtx
// STC: STC-302 — [PBT] BR-03: split invariants (sum, floor, floor 2000)
//
// Preconditions (STC §PBT): fast-check 4.9+ available; resolver implemented (Task 1).
// Deterministic seed keeps every run reproducible (STC "fixed seed" requirement).

/** Fixed seed for reproducible property runs (STC-300/301/302 test data note). */
const FC_SEED = 20261012;
const FC_RUNS = 100;

describe('resolveContextBudget property-based tests (STC-300/301/302)', () => {
  it('imports fast-check successfully (PBT precondition)', () => {
    expect(typeof fc.assert).toBe('function');
    expect(typeof fc.property).toBe('function');
    expect(typeof fc.integer).toBe('function');
  });

  it('STC-300: BR-01 — resolved nCtx is always > 0, finite, integer (100 runs)', () => {
    const modelIds = fc.constantFrom('qwen', 'llama3.1', 'gpt-4o-mini', 'llama-unknown', '');
    const detectedNCtx = fc.option(
      fc.oneof(
        fc.integer({ min: -1000, max: 1000000 }),
        fc.constant(0),
        fc.constant(Number.NaN),
        fc.constant(Number.POSITIVE_INFINITY),
        fc.constant(Number.NEGATIVE_INFINITY)
      ),
      { nil: undefined }
    );
    fc.assert(
      fc.property(modelIds, detectedNCtx, (modelId, nCtxDetected) => {
        const budget = resolveContextBudget({ modelId, nCtxDetected });
        return budget.nCtx > 0 && Number.isFinite(budget.nCtx) && Number.isInteger(budget.nCtx);
      }),
      { seed: FC_SEED, numRuns: FC_RUNS }
    );
  });

  it('STC-301: BR-02 — safetyMargin === ceil(n × 0.08) for every n in [1, 1,000,000]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (n) => {
        return resolveContextBudget({ modelId: 'x', nCtxDetected: n }).safetyMargin === Math.ceil(n * 0.08);
      }),
      { seed: FC_SEED, numRuns: FC_RUNS }
    );
  });

  it('STC-302: BR-03 — split invariants hold for every n in [1, 1,000,000]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (n) => {
        const b = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: n });
        const usable = Math.max(n - b.reserveOutput - b.safetyMargin, 1);
        return (
          b.reserveOutput >= 2000 &&
          b.staticBudget === Math.floor(usable * 0.7) &&
          b.staticBudget + b.historyBudget === usable &&
          b.historyBudget === usable - b.staticBudget
        );
      }),
      { seed: FC_SEED, numRuns: FC_RUNS }
    );
  });

  it('STC-302 spot anchors: 8192 → {656, 3875, 1661}; 32768 → {2622, 19668, 8430}', () => {
    const at8k = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: 8192 });
    expect(at8k.safetyMargin).toBe(656);
    expect(at8k.staticBudget).toBe(3875);
    expect(at8k.historyBudget).toBe(1661);

    const at32k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    expect(at32k.safetyMargin).toBe(2622);
    expect(at32k.staticBudget).toBe(19668);
    expect(at32k.historyBudget).toBe(8430);
  });
});
