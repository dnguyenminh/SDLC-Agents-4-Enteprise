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
import type { ContextBudget } from '../models/ContextBudget.js';
import {
  enforceBudgetGate,
  halveSteeringCap,
  isBudgetExceededError,
  measureStaticAssembly,
  measureUsagePercent,
  PiContextBudgetExceededError,
  runBudgetGate,
  type EscalationStep,
  type GateAssembly,
  type GateHooks,
} from '../budget-gate.js';

// STC: STC-206 — absolute exceed → exact PI_CONTEXT_BUDGET_EXCEEDED message (BR-09/BR-16)
// STC: STC-207 — original incident (67,468 vs 65,536) intercepted by the gate — no 400 possible
// STC: STC-201 — degenerate model (n_ctx=2048) fails safe with the actionable error (EF-2 UC-01)

/** Resolved budgets (UC-01 — real Task-1 resolver, BR-01/02/03 formulas). */
const budget32k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
const budget8k = resolveContextBudget({ modelId: 'llama3.1', nCtxDetected: 8192 });
const budget65536 = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 65536 });
const budget2k = resolveContextBudget({ modelId: 'phi-3-mini', nCtxDetected: 2048 });

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

describe('enforceBudgetGate — absolute exceed (BR-09 / STC-206 / STC-207 / STC-201)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('STC-206: 8k model, huge dense static → throws the EXACT actionable message', () => {
    const { hooks } = planHooks({
      compress: () => 50000,
      'drop-steering': () => 49000,
      'min-loadout': () => 48000, // still >95% after the full ladder
    });
    const out = runBudgetGate(budget8k, assembly(51400), hooks);
    expect(out.decision).toBe('REJECT');
    expect(() => enforceBudgetGate(out, budget8k)).toThrowError(
      'PI_CONTEXT_BUDGET_EXCEEDED: static context 48000 tokens vượt budget 3841 cho model n_ctx=8192. Giảm steering/tools hoặc dùng model context lớn hơn.'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'PI_CONTEXT_BUDGET_EXCEEDED',
      expect.objectContaining({ staticTokens: 48000, staticBudget: 3841, nCtx: 8192 })
    );
  });

  it('STC-207: original incident 67,468 tokens vs n_ctx=65,536 → REJECT — the 400 is structurally impossible', () => {
    const out = runBudgetGate(budget65536, assembly(67468), planHooks({}).hooks);
    expect(out.decision).toBe('REJECT'); // (67468+2048)/65536 ≈ 106.1% > 95
    expect(() => enforceBudgetGate(out, budget65536)).toThrowError(/PI_CONTEXT_BUDGET_EXCEEDED: static context 67468 tokens vượt budget 40771 cho model n_ctx=65536/);
  });

  it('STC-201: degenerate n_ctx=2048 (staticBudget 0) → REJECT with actionable message', () => {
    const out = runBudgetGate(budget2k, assembly(2000), planHooks({}).hooks);
    expect(out.decision).toBe('REJECT'); // (2000+2000)/2048 ≈ 195%
    expect(() => enforceBudgetGate(out, budget2k)).toThrowError(
      'PI_CONTEXT_BUDGET_EXCEEDED: static context 2000 tokens vượt budget 0 cho model n_ctx=2048. Giảm steering/tools hoặc dùng model context lớn hơn.'
    );
  });

  it('ALLOW and WARN never throw', () => {
    const allow = runBudgetGate(budget32k, assembly(7000), planHooks({}).hooks);
    expect(() => enforceBudgetGate(allow, budget32k)).not.toThrow();
  });

  it('PiContextBudgetExceededError carries the counts for the banner (STC-501 N/M/K)', () => {
    const err = new PiContextBudgetExceededError(48000, 3841, 8192);
    expect(err.name).toBe('PiContextBudgetExceededError');
    expect(err.staticTokens).toBe(48000);
    expect(err.staticBudget).toBe(3841);
    expect(err.nCtx).toBe(8192);
  });

  it('isBudgetExceededError: instanceof OR message prefix (module-instance safe)', () => {
    expect(isBudgetExceededError(new PiContextBudgetExceededError(1, 1, 1))).toBe(true);
    expect(isBudgetExceededError(new Error('PI_CONTEXT_BUDGET_EXCEEDED: static context 9 tokens...'))).toBe(true);
    expect(isBudgetExceededError(new Error('PI_SESSION_TIMEOUT'))).toBe(false);
    expect(isBudgetExceededError('not an error')).toBe(false);
  });
});

describe('measureUsagePercent + measureStaticAssembly (UC-05 wiring support)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the real BudgetCalculator: usage = (static + reserve) / nCtx × 100', () => {
    expect(measureUsagePercent(budget32k, assembly(7000))).toBeCloseTo(9048 / 32768 * 100, 5);
    expect(measureUsagePercent(budget8k, assembly(0))).toBeCloseTo(2048 / 8192 * 100, 5); // 25% reserve floor
  });

  it('measures context files + workspace prompt + SDK base + tool schemas (chars/4)', () => {
    const files = [{ content: 'x'.repeat(40000) }]; // 10,000 tokens
    const raw = measureStaticAssembly({
      contextFiles: files,
      compress: false,
      workspacePrompt: 'p'.repeat(4000), // 1,000 tokens
      toolSchemaTokens: 1500,
    });
    // 10,000 + 1,000 + ceil(7500/4)=1,875 + 1,500 = 14,375
    expect(raw.staticTokens).toBe(14375);
  });

  it('compression reduces the measurement only for compressible content (BR-04/BR-15)', () => {
    const compressible = { content: '<!-- internal note -->\nTip: boilerplate\nprose stays' };
    const dense = { content: 'w'.repeat(120) };
    const common = { workspacePrompt: 'p', toolSchemaTokens: 10 };
    const raw = measureStaticAssembly({ ...common, contextFiles: [compressible, dense], compress: false });
    const compressed = measureStaticAssembly({ ...common, contextFiles: [compressible, dense], compress: true });
    expect(compressed.staticTokens).toBeLessThan(raw.staticTokens);
    // Dense-only content is non-worsening: measurement identical either way (BR-15).
    const denseRaw = measureStaticAssembly({ ...common, contextFiles: [dense], compress: false });
    const denseCompressed = measureStaticAssembly({ ...common, contextFiles: [dense], compress: true });
    expect(denseCompressed.staticTokens).toBe(denseRaw.staticTokens);
  });
});

describe('halveSteeringCap — ladder step 2 (BR-08)', () => {
  it('halves the steering share; other budget fields are preserved', () => {
    const halved: ContextBudget = halveSteeringCap(budget8k);
    expect(halved.staticBudget).toBe(1920); // floor(3841/2)
    expect(halved.nCtx).toBe(budget8k.nCtx);
    expect(halved.reserveOutput).toBe(budget8k.reserveOutput);
    expect(halved.safetyMargin).toBe(budget8k.safetyMargin);
    expect(halved.historyBudget).toBe(budget8k.historyBudget);
  });

  it('keeps degenerate budgets degenerate (0 stays 0 — gate decides)', () => {
    expect(halveSteeringCap(budget2k).staticBudget).toBe(0);
  });
});
