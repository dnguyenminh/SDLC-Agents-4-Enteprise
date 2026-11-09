/**
 * SA4E-422 — gate wiring for the REAL runtime token count (AC1/AC2/AC5).
 * The runtime count drives the initial measurement; escalation variants fall
 * back to estimates. Integration: qwen 32k budget breakdown + REJECT proof.
 */

import { describe, it, expect } from 'vitest';
import { measureStaticAssembly, PiContextBudgetExceededError } from '../budget-gate';
import { runSessionBudgetGate } from '../session-budget-gate';
import { resolveContextBudget } from '../context-budget-resolver';

/** base/system-prompt share, derived empirically (no hardcoded constants in test). */
const basePromptTokens = measureStaticAssembly({
  contextFiles: [],
  compress: false,
  workspacePrompt: '',
  toolSchemaTokens: 0,
}).staticTokens;

describe('SA4E-422 measureStaticAssembly with runtime count', () => {
  it('uses the REAL count when provided and untransformed', () => {
    const files = [{ content: 'x'.repeat(40000) }]; // ~10000 estimated tokens
    const estimated = measureStaticAssembly({ contextFiles: files, compress: false, workspacePrompt: 'y'.repeat(400), toolSchemaTokens: 100 });
    const real = measureStaticAssembly({ contextFiles: files, compress: false, workspacePrompt: 'y'.repeat(400), toolSchemaTokens: 100, runtimeStaticTokens: 5000 });
    expect(real.staticTokens).toBe(5000 + basePromptTokens + 100);
    expect(real.staticTokens).toBeLessThan(estimated.staticTokens);
  });

  it('ignores the runtime count for transformed (compressed) measurements', () => {
    const files = [{ content: 'x'.repeat(40000) }];
    const estimatedCompressed = measureStaticAssembly({ contextFiles: files, compress: true, workspacePrompt: '', toolSchemaTokens: 0 });
    const withRuntime = measureStaticAssembly({
      contextFiles: files, compress: true, workspacePrompt: '', toolSchemaTokens: 0, runtimeStaticTokens: 5000,
    });
    expect(withRuntime.staticTokens).toBe(estimatedCompressed.staticTokens); // falls back to estimates
  });
});

describe('SA4E-422 session gate uses runtime count (real tokenizer drives decisions)', () => {
  const files = [{ content: 'small file' }];
  const base = {
    loadFiles: () => files,
    workspacePrompt: 'p',
    toolSchemaTokens: 100,
    minToolSchemaTokens: 10,
    shouldCompress: false,
  };

  it('runtime count over budget TRIGGERS the escalation ladder (decision driven by real count)', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    const without = runSessionBudgetGate(budget, { ...base });
    expect(without.outcome.escalations).toHaveLength(0); // tiny estimates → nothing fired
    const withRuntime = runSessionBudgetGate(budget, { ...base, runtimeStaticCount: budget.staticBudget * 2 });
    expect(withRuntime.outcome.escalations.length).toBeGreaterThan(0); // real count fired the ladder
  });

  it('REJECT when even the escalation ladder cannot fit the content (fail-safe)', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    const heavy = [{ content: 'x'.repeat(300000) }]; // ~75k estimated at every ladder step
    expect(() =>
      runSessionBudgetGate(budget, {
        ...base,
        loadFiles: () => heavy,
        runtimeStaticCount: 90000, // real tokenizer agrees it is oversized
      }),
    ).toThrow(PiContextBudgetExceededError);
  });

  it('qwen 32k breakdown: real count just under budget → initial measurement is the real one (AC5)', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    expect(budget.nCtx).toBe(32768);
    const runtimeCount = budget.staticBudget - basePromptTokens - 100 - 50; // 50-token headroom
    const result = runSessionBudgetGate(budget, { ...base, runtimeStaticCount: runtimeCount });
    expect(result.outcome.staticTokens).toBe(runtimeCount + basePromptTokens + 100);
    expect(result.outcome.escalations).toHaveLength(0);
    expect(['ALLOW', 'WARN']).toContain(result.outcome.decision);
  });
});
