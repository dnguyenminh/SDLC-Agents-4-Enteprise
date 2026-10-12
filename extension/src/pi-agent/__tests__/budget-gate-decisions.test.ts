import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { resolveContextBudget } from '../context-budget-resolver.js';
import {
  enforceBudgetGate,
  runBudgetGate,
  type EscalationStep,
  type GateAssembly,
  type GateHooks,
} from '../budget-gate.js';

// STC: STC-011 — gate ALLOW: session created within budget (qwen 32k)
// STC: STC-012 — gate WARN (85–95%): session proceeds with warning (AF-1 UC-05)
// STC: STC-310/STC-401 — threshold boundaries 85.0 / 85.01 / 95.0 / 95.01 through the real calculator
// STC: BR-13 — REJECT > 95%, WARN > 85%, else ALLOW (verified constants)

/** Resolved budgets (UC-01 — real Task-1 resolver, BR-01/02/03 formulas). */
const budget32k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
const budget10k = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: 10000 });

const assembly = (staticTokens: number): GateAssembly => ({ staticTokens });

/** Ladder hooks that record call order and transform static tokens per plan. */
function planHooks(plan: Partial<Record<EscalationStep, (tokens: number) => number>>): {
  hooks: GateHooks;
  calls: EscalationStep[];
} {
  const calls: EscalationStep[] = [];
  const make = (step: EscalationStep) => (current: GateAssembly): GateAssembly => {
    calls.push(step);
    const apply = plan[step];
    return { staticTokens: apply ? apply(current.staticTokens) : current.staticTokens };
  };
  return {
    hooks: {
      compress: make('compress'),
      dropSteering: make('drop-steering'),
      minLoadout: make('min-loadout'),
    },
    calls,
  };
}

describe('runBudgetGate — decisions (BR-13 / STC-310 / STC-401)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('STC-011: qwen 32k with static 7,000 tokens → ALLOW, zero escalation events', () => {
    const { hooks, calls } = planHooks({});
    const out = runBudgetGate(budget32k, assembly(7000), hooks);
    expect(out.decision).toBe('ALLOW');
    expect(out.usagePercent).toBeCloseTo((7000 + 2048) / 32768 * 100, 2); // ≈ 27.61%
    expect(out.escalations).toEqual([]);
    expect(calls).toEqual([]); // within staticBudget share — ladder never fires (STC-306 allow side)
    expect(logger.info).toHaveBeenCalledWith('PI_GATE_DECISION', expect.objectContaining({ decision: 'ALLOW' }));
  });

  it('STC-012: n_ctx=10,000 with static 7,200 → 92% WARN — proceeds, warning logged', () => {
    const { hooks } = planHooks({}); // ladder tries, nothing shrinks — WARN zone persists
    const out = runBudgetGate(budget10k, assembly(7200), hooks);
    expect(out.decision).toBe('WARN');
    expect(out.usagePercent).toBeCloseTo(92.0, 2);
    expect(logger.warn).toHaveBeenCalledWith('PI_GATE_WARN', expect.objectContaining({ usagePercent: 92 }));
    expect(() => enforceBudgetGate(out, budget10k)).not.toThrow(); // AF-1 UC-05: proceeds
  });

  it.each([
    [6500, 'ALLOW', 85.0], // 85.000% — NOT > 85
    [6501, 'WARN', 85.01],
    [7500, 'WARN', 95.0], // 95.000% — NOT > 95
    [7501, 'REJECT', 95.01],
  ] as const)('STC-310/401 boundary: static %i → %s', (staticTokens, decision, usage) => {
    const out = runBudgetGate(budget10k, assembly(staticTokens), planHooks({}).hooks);
    expect(out.decision).toBe(decision);
    expect(out.usagePercent).toBeCloseTo(usage, 2);
  });
});
