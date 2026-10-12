/**
 * SA4E-355 Wave 3 — session budget gate wiring (UC-05 Task 5).
 * runSessionBudgetGate composes measurement + ladder + enforcement and maps
 * escalations to real-effect flags (BR-08/BR-09). WARN/ALLOW never throw.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveContextBudget } from '../context-budget-resolver.js';
import { isBudgetExceededError } from '../budget-gate.js';
import { runSessionBudgetGate, type SessionGateInput } from '../session-budget-gate.js';

// STC: STC-011 — ALLOW: small static passes through unchanged (Task 5 wiring)
// STC: STC-012 — WARN (85–95%): resolves normally, proceeds (AF-1 UC-05)
// STC: STC-110 — escalation success: compress step forces shouldCompress
// STC: STC-206 — absolute exceed: REJECT throws PI_CONTEXT_BUDGET_EXCEEDED
// STC: STC-205 — ladder order: drop-steering halves the steering share

const budget32k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
const budget8k = resolveContextBudget({ modelId: 'llama3.1', nCtxDetected: 8192 });

function input(over: Partial<SessionGateInput> = {}): SessionGateInput {
  return {
    loadFiles: () => [],
    workspacePrompt: 'p',
    toolSchemaTokens: 10,
    minToolSchemaTokens: 5,
    shouldCompress: false,
    ...over,
  };
}

describe('runSessionBudgetGate — Task 5 wiring (UC-05 / BR-08 / BR-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('STC-011: small static → ALLOW, flags unchanged, no escalation', () => {
    const gate = runSessionBudgetGate(budget32k, input());
    expect(gate.outcome.decision).toBe('ALLOW');
    expect(gate.outcome.escalations).toEqual([]);
    expect(gate.shouldCompress).toBe(false);
    expect(gate.minLoadout).toBe(false);
    expect(gate.steeringBudget).toBe(budget32k);
  });

  it('STC-110: over-share static → compress escalates for real (shouldCompress)', () => {
    const big = 'x'.repeat(4 * (budget32k.staticBudget + 5000));
    const gate = runSessionBudgetGate(budget32k, input({ loadFiles: () => [{ content: big }] }));
    expect(gate.outcome.escalations[0]).toBe('compress');
    expect(gate.shouldCompress).toBe(true);
  });

  it('STC-205: drop-steering halves the steering share for scopedSteering', () => {
    const half = 'z'.repeat(4 * 2500);
    const gate = runSessionBudgetGate(
      budget8k,
      input({ loadFiles: () => [{ content: half }, { content: half }], toolSchemaTokens: 100, minToolSchemaTokens: 50 })
    );
    expect(gate.outcome.escalations).toContain('drop-steering');
    expect(gate.steeringBudget.staticBudget).toBe(Math.floor(budget8k.staticBudget / 2));
  });

  it('STC-206: absolute exceed → throws PI_CONTEXT_BUDGET_EXCEEDED (BR-09)', () => {
    const huge = 'w'.repeat(4 * 60000);
    let thrown: unknown;
    try {
      runSessionBudgetGate(budget8k, input({ loadFiles: () => [{ content: huge }] }));
    } catch (err) {
      thrown = err;
    }
    expect(isBudgetExceededError(thrown)).toBe(true);
    expect((thrown as Error).message).toMatch(/^PI_CONTEXT_BUDGET_EXCEEDED: static context \d+ tokens/);
    expect((thrown as Error).message).toContain('n_ctx=8192');
  });

  it('STC-012: WARN resolves normally — the host proceeds (AF-1 UC-05)', () => {
    const budget10k = resolveContextBudget({ modelId: 'llama-unknown', nCtxDetected: 10000 });
    const gate = runSessionBudgetGate(budget10k, input({ workspacePrompt: 'q'.repeat(20000) }));
    expect(gate.outcome.decision).toBe('WARN');
    expect(gate.outcome.usagePercent).toBeGreaterThan(85);
  });

  it('unloadable workspace measures as empty — the turn never breaks', () => {
    const gate = runSessionBudgetGate(
      budget32k,
      input({ loadFiles: () => { throw new Error('EACCES'); } })
    );
    expect(gate.outcome.decision).toBe('ALLOW');
  });
});
