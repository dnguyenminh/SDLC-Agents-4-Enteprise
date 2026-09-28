import { describe, it, expect, vi } from 'vitest';
import { VerificationLoop, MAX_REGENERATED_ANSWER_CHARS } from '../verification-loop';
import { HallucinationGrader } from '../hallucination-grader';
import type { SourceCitation, GradeResult } from '../faithfulness';

const SOURCES: SourceCitation[] = [
  { path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window' },
];
const GROUNDED = 'The model has a 2k context window.';
const HALLUCINATED = 'The API costs 99 dollars per month with premium support plans.';

function graderReturning(scores: number[]): { grader: HallucinationGrader; gradeSpy: ReturnType<typeof vi.fn> } {
  let call = 0;
  const gradeSpy = vi.fn(async (): Promise<GradeResult> => {
    const score = scores[Math.min(call, scores.length - 1)];
    call += 1;
    return { score, issues: [] };
  });
  return { grader: new HallucinationGrader(gradeSpy as any), gradeSpy };
}

describe('VerificationLoop', () => {
  // STC: TC-001 — high faithfulness passes without retry
  it('verified answer passes without retry', async () => {
    const { grader, gradeSpy } = graderReturning([0.95]);
    const loop = new VerificationLoop(grader);
    const result = await loop.verify(GROUNDED, SOURCES, 'large');
    expect(result.verified).toBe(true);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.attempts).toBe(1);
    expect(gradeSpy).toHaveBeenCalledTimes(1);
  });

  // STC: TC-002 — Verification Loop Retries On Low Faithfulness
  it('low faithfulness triggers a retry', async () => {
    const regenerate = vi.fn(async () => GROUNDED);
    const { grader } = graderReturning([0.2, 0.95]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(result.verified).toBe(true);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.attempts).toBe(2);
  });

  // STC: TC-301 — Wrong Fact Answers Caught + Retry
  it('wrong facts are caught and retried (computeFaithfulness default grader)', async () => {
    const regenerate = vi.fn(async () => GROUNDED);
    const loop = new VerificationLoop(new HallucinationGrader(), { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.verified).toBe(true);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.attempts).toBe(2);
  });

  it('retry still low → fallback accepts the best answer', async () => {
    const regenerate = vi.fn(async () => 'Slightly better but still wrong answer.');
    const { grader } = graderReturning([0.1, 0.4]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.verified).toBe(false);
    expect(result.revisedAnswer).toBe('Slightly better but still wrong answer.');
    expect(result.attempts).toBe(2);
  });

  it('no regenerate dependency → accepts original after first attempt', async () => {
    const { grader } = graderReturning([0.3]);
    const loop = new VerificationLoop(grader);
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.verified).toBe(false);
    expect(result.revisedAnswer).toBe(HALLUCINATED);
    expect(result.attempts).toBe(1);
  });

  it('original answer wins when retry scores worse', async () => {
    const regenerate = vi.fn(async () => 'Even worse hallucination.');
    const { grader } = graderReturning([0.5, 0.1]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.revisedAnswer).toBe(HALLUCINATED);
    expect(result.score).toBe(0.5);
  });

  // STC: TC-702 — Verification Loop → Hallucination Grader Integration
  it('loop invokes the injected grader with answer and sources', async () => {
    const { grader, gradeSpy } = graderReturning([0.9]);
    const loop = new VerificationLoop(grader);
    await loop.verify(GROUNDED, SOURCES, 'large');
    expect(gradeSpy).toHaveBeenCalledWith(GROUNDED, SOURCES);
  });

  // VERIFY_TIMEOUT → return original (FSD 12.2)
  it('loop timeout → returns original answer with 0 attempts', async () => {
    const hanging = new HallucinationGrader((() => new Promise<never>(() => {})) as any);
    const loop = new VerificationLoop(hanging, { config: { timeoutMs: 100 } });
    const result = await loop.verify(GROUNDED, SOURCES, 'large');
    expect(result.verified).toBe(false);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.attempts).toBe(0);
  });

  it('grader internal GRADE_TIMEOUT → score 0 → accepts original (fallback)', async () => {
    const hanging = new HallucinationGrader((() => new Promise<never>(() => {})) as any, { timeoutMs: 50 });
    const loop = new VerificationLoop(hanging, { config: { timeoutMs: 1000 } });
    const result = await loop.verify(GROUNDED, SOURCES, 'large');
    expect(result.verified).toBe(false);
    expect(result.revisedAnswer).toBe(GROUNDED);
    expect(result.score).toBe(0);
    expect(result.attempts).toBe(1);
  });

  it('regenerate throwing → returns original answer', async () => {
    const { grader } = graderReturning([0.3]);
    const regenerate = vi.fn(async () => {
      throw new Error('regeneration failed');
    });
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.revisedAnswer).toBe(HALLUCINATED);
    expect(result.verified).toBe(false);
  });

  it('custom maxRetries=2 retries twice before accepting', async () => {
    const regenerate = vi.fn(async (answer: string) => answer);
    const { grader } = graderReturning([0.1, 0.2, 0.9]);
    const loop = new VerificationLoop(grader, { regenerate, config: { maxRetries: 2 } });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(result.attempts).toBe(3);
    expect(result.verified).toBe(true);
  });

  // SEC-328-04 — regenerate output validated (type + length) before grading
  it('SEC-328-04: regenerate returning non-string breaks the retry loop', async () => {
    const regenerate = vi.fn(async () => 12345 as unknown as string);
    const { grader, gradeSpy } = graderReturning([0.3]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(gradeSpy).toHaveBeenCalledTimes(1); // invalid output never graded
    expect(result.attempts).toBe(1);
    expect(result.verified).toBe(false);
    expect(result.revisedAnswer).toBe(HALLUCINATED); // best (original) retained
  });

  it('SEC-328-04: regenerate returning oversized text breaks the retry loop', async () => {
    const regenerate = vi.fn(async () => 'x'.repeat(MAX_REGENERATED_ANSWER_CHARS + 1));
    const { grader, gradeSpy } = graderReturning([0.3]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(gradeSpy).toHaveBeenCalledTimes(1); // oversized output never graded
    expect(result.attempts).toBe(1);
    expect(result.verified).toBe(false);
  });

  it('SEC-328-04: regenerate output within the cap is graded normally', async () => {
    const regenerate = vi.fn(async () => GROUNDED);
    const { grader, gradeSpy } = graderReturning([0.3, 0.95]);
    const loop = new VerificationLoop(grader, { regenerate });
    const result = await loop.verify(HALLUCINATED, SOURCES, 'large');
    expect(gradeSpy).toHaveBeenCalledTimes(2);
    expect(result.verified).toBe(true);
  });
});
