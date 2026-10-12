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
  runBudgetGate,
  type EscalationStep,
  type GateAssembly,
  type GateHooks,
} from '../budget-gate.js';

// STC: STC-205 — escalation ladder executes in fixed order, re-measure after each step (BR-08)
// STC: STC-306 — no over-escalation: unused ladder steps never fire (BR-08)

/** Resolved budget (UC-01 — real Task-1 resolver, BR-01/02/03 formulas). */
const budget16k = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: 16384 });

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

describe('runBudgetGate — escalation ladder (BR-08 / STC-205 / STC-306)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('STC-205: fires strictly in order compress → drop-steering → min-loadout, re-measuring after each', () => {
    // budget16k: staticBudget 9,117; initial 12,900 > share → all three steps needed.
    const { hooks, calls } = planHooks({
      compress: () => 11700,
      'drop-steering': () => 9500,
      'min-loadout': () => 8500,
    });
    const out = runBudgetGate(budget16k, assembly(12900), hooks);
    expect(calls).toEqual(['compress', 'drop-steering', 'min-loadout']); // fixed order (BR-08)
    expect(out.escalations).toEqual(['compress', 'drop-steering', 'min-loadout']);
    expect(out.staticTokens).toBe(8500); // final re-measured assembly
    expect(out.decision).toBe('ALLOW'); // (8500+2000)/16384 ≈ 64.1%
    for (const step of ['compress', 'drop-steering', 'min-loadout'] as const) {
      expect(logger.info).toHaveBeenCalledWith(
        'PI_GATE_ESCALATION',
        expect.objectContaining({ step })
      );
    }
  });

  it('STC-306/STC-110: compression alone suffices → steps 2–3 never fire', () => {
    const { hooks, calls } = planHooks({ compress: () => 6300 }); // 6300 ≤ 9,117
    const out = runBudgetGate(budget16k, assembly(10700), hooks);
    expect(calls).toEqual(['compress']);
    expect(out.decision).toBe('ALLOW');
    expect(out.staticTokens).toBe(6300);
  });

  it('a failing ladder step is logged and skipped — the gate never breaks the turn', () => {
    const calls: string[] = [];
    const hooks: GateHooks = {
      compress: () => {
        calls.push('compress');
        throw new Error('boom');
      },
      dropSteering: (current) => {
        calls.push('drop-steering');
        return { staticTokens: 7000 }; // within share → ladder stops here
      },
      minLoadout: (current) => {
        calls.push('min-loadout');
        return current;
      },
    };
    const out = runBudgetGate(budget16k, assembly(12000), hooks);
    expect(calls).toEqual(['compress', 'drop-steering']); // step 1 failed, step 2 recovered
    expect(logger.error).toHaveBeenCalledWith(
      'PI_GATE_ESCALATION_FAILED',
      expect.objectContaining({ step: 'compress' })
    );
    expect(out.staticTokens).toBe(7000);
    expect(out.decision).toBe('ALLOW');
  });
});
