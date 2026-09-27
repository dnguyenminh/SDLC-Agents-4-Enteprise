import { describe, it, expect } from 'vitest';
import {
  BudgetCalculator,
  ContextBudgetError,
  MIN_RESERVE_TOKENS,
  ThresholdGate,
} from '../../mcp/context-budget';

// STC: TC-002 — Context budget calculation within limit (BR-04, BR-05)
// STC: TC-201 — Budget >95% rejects session (BR-06)
// STC: TC-202 — Budget >85% shows warning (BR-07)
// STC: TC-401 — Reserve minimum 2000 tokens enforced (BR-04)
// STC: TC-601 — Budget calculation performance <100ms

const tc002Inputs = {
  systemPromptChars: 7500,
  toolSchemaTokens: 500,
  retrievalTokens: 300,
  historyTokens: 200,
  reserveTokens: 2000,
};

describe('BudgetCalculator', () => {
  it('TC-002/BR-05: converts chars to tokens with ceil heuristic (1 token ~ 4 chars)', () => {
    expect(BudgetCalculator.estimateTokens(7500)).toBe(1875);
    expect(BudgetCalculator.estimateTokens(1)).toBe(1);
    expect(BudgetCalculator.estimateTokens(0)).toBe(0);
    expect(BudgetCalculator.estimateTokens(-5)).toBe(0);
    expect(BudgetCalculator.estimateTokens(Number.NaN)).toBe(0);
    expect(BudgetCalculator.estimateTokens(undefined)).toBe(0);
  });

  it('TC-002: budget = system + tool + retrieval + history + reserve 2000', () => {
    const result = BudgetCalculator.calculateBudget(8192, tc002Inputs);
    expect(result.estimatedTokens).toBe(1875 + 500 + 300 + 200 + 2000);
    expect(result.usagePercent).toBeCloseTo(59.5, 1);
    expect(ThresholdGate.evaluate(result.usagePercent).decision).toBe('ALLOW');
  });

  it('TC-201: smollm2-360m (1024) with large history rejects at >95%', () => {
    const result = BudgetCalculator.calculateBudget(1024, {
      systemPromptChars: 7500,
      toolSchemaTokens: 500,
      retrievalTokens: 300,
      historyTokens: 200,
      reserveTokens: 2000,
    });
    expect(result.usagePercent).toBeGreaterThan(95);
    expect(ThresholdGate.evaluate(result.usagePercent).decision).toBe('REJECT');
  });

  it('TC-201: threshold message includes usage percent and reduction hint', () => {
    const gate = ThresholdGate.evaluate((1000 / 1024) * 100);
    expect(gate.decision).toBe('REJECT');
    expect(gate.message).toBe('Session rejected: usage 98% >95% threshold. Reduce history/retrieval.');
  });

  it('TC-202: usage 90% returns WARN decision', () => {
    const gate = ThresholdGate.evaluate(90);
    expect(gate.decision).toBe('WARN');
    expect(gate.message).toContain('90%');
    expect(gate.message).toContain('>85% threshold');
  });

  it('boundary: 85% allows, 85.5% warns, 95% warns, 95.1% rejects', () => {
    expect(ThresholdGate.evaluate(85).decision).toBe('ALLOW');
    expect(ThresholdGate.evaluate(85.5).decision).toBe('WARN');
    expect(ThresholdGate.evaluate(95).decision).toBe('WARN');
    expect(ThresholdGate.evaluate(95.1).decision).toBe('REJECT');
    expect(ThresholdGate.evaluate(50).decision).toBe('ALLOW');
  });

  it('TC-401: reserve=1999 is forced to the 2000 minimum (BR-04)', () => {
    const result = BudgetCalculator.calculateBudget(8192, { ...tc002Inputs, reserveTokens: 1999 });
    expect(result.reserveTokens).toBe(MIN_RESERVE_TOKENS);
    expect(result.conservative).toBe(true);
  });

  it('TC-401: missing reserve defaults to 2000 without conservative flag', () => {
    const result = BudgetCalculator.calculateBudget(8192, {
      systemPromptChars: 7500,
      toolSchemaTokens: 500,
      retrievalTokens: 300,
      historyTokens: 200,
    });
    expect(result.reserveTokens).toBe(MIN_RESERVE_TOKENS);
    expect(result.conservative).toBe(false);
  });

  it('EF-1: invalid estimation input falls back conservatively with warn flag', () => {
    const result = BudgetCalculator.calculateBudget(8192, {
      ...tc002Inputs,
      toolSchemaTokens: Number.NaN,
    });
    expect(result.estimatedTokens).toBe(1875 + 0 + 300 + 200 + 2000);
    expect(result.conservative).toBe(true);
  });

  it('non-positive contextWindow conservatively reports 100% usage', () => {
    const result = BudgetCalculator.calculateBudget(0, tc002Inputs);
    expect(result.usagePercent).toBe(100);
  });

  it('TC-601: budget calculation averages <100ms over 100 runs', () => {
    const started = performance.now();
    for (let i = 0; i < 100; i++) {
      BudgetCalculator.calculateBudget(128000, { ...tc002Inputs, historyTokens: i });
      ThresholdGate.evaluate(50 + (i % 50));
    }
    const avgMs = (performance.now() - started) / 100;
    expect(avgMs).toBeLessThan(100);
  });
});

describe('ContextBudgetError', () => {
  it('carries budget details for diagnostics', () => {
    const err = new ContextBudgetError('over budget', { estimatedTokens: 100, usagePercent: 150 });
    expect(err.name).toBe('ContextBudgetError');
    expect(err.message).toBe('over budget');
    expect(err.budget.usagePercent).toBe(150);
  });
});
