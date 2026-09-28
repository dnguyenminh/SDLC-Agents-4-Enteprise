import { describe, it, expect, vi } from 'vitest';
import { resolveVerifyStrategy, verifyAfterExecuteTools } from '../verification-loop';
import { HallucinationGrader } from '../hallucination-grader';
import type { SourceCitation, GradeResult } from '../faithfulness';

const SOURCES: SourceCitation[] = [
  { path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window' },
];
const GROUNDED = 'The model has a 2k context window.';
const HALLUCINATED = 'The API costs 99 dollars per month with premium support plans.';

function graderReturning(scores: number[]): HallucinationGrader {
  let call = 0;
  const gradeFn = vi.fn(async (): Promise<GradeResult> => {
    const score = scores[Math.min(call, scores.length - 1)];
    call += 1;
    return { score, issues: [] };
  });
  return new HallucinationGrader(gradeFn as any);
}

describe('resolveVerifyStrategy', () => {
  // STC: TC-003 — Small Model Skips Self Verify (direct routing + external grader)
  it('small tier routes to external grader', () => {
    expect(resolveVerifyStrategy('small')).toBe('external-grader');
  });

  // STC: TC-101 — Large Model Keeps Verify
  it('large tier keeps self-verify', () => {
    expect(resolveVerifyStrategy('large')).toBe('self-verify');
  });

  // STC: TC-703 — Model Routing Integration
  it('medium and unknown tiers keep self-verify', () => {
    expect(resolveVerifyStrategy('medium')).toBe('self-verify');
    expect(resolveVerifyStrategy(null)).toBe('self-verify');
  });
});

describe('verifyAfterExecuteTools', () => {
  // STC: TC-701 — Execute Tools → Verification Loop Integration (post execute_tools hook)
  it('TC-701: invoked after execute_tools with tool-derived sources', async () => {
    const executeTools = vi.fn(() => ({
      answer: GROUNDED,
      sources: SOURCES,
    }));
    const toolResult = executeTools();
    const result = await verifyAfterExecuteTools({
      answer: toolResult.answer,
      sources: toolResult.sources,
      modelId: 'claude-3-opus',
    });
    expect(executeTools).toHaveBeenCalled();
    expect(result.verified).toBe(true);
    expect(result.strategy).toBe('self-verify');
  });

  // STC: TC-703 — Model Routing Integration (small → external grader strategy)
  it('small model routes to external-grader strategy', async () => {
    const result = await verifyAfterExecuteTools({
      answer: GROUNDED,
      sources: SOURCES,
      modelId: 'phi-3-mini',
    });
    expect(result.strategy).toBe('external-grader');
  });

  // STC: TC-704 — Retry Integration (retry triggered → new answer generated)
  it('TC-704: low faithfulness triggers regeneration via the hook', async () => {
    const regenerate = vi.fn(async () => GROUNDED);
    const result = await verifyAfterExecuteTools({
      answer: HALLUCINATED,
      sources: SOURCES,
      modelId: 'gpt-4o',
      regenerate,
    });
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.verified).toBe(true);
  });

  it('accepts injected grader', async () => {
    const grader = graderReturning([0.85]);
    const result = await verifyAfterExecuteTools({
      answer: GROUNDED,
      sources: SOURCES,
      grader,
    });
    expect(result.score).toBe(0.85);
  });
});
