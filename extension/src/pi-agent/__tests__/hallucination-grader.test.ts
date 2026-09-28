import { describe, it, expect, vi } from 'vitest';
import {
  HallucinationGrader,
  FAITHFULNESS_THRESHOLD,
  GRADE_TIMEOUT_MS,
} from '../hallucination-grader';
import { computeFaithfulness, type SourceCitation } from '../faithfulness';

const SOURCES: SourceCitation[] = [
  { path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window' },
];

describe('HallucinationGrader', () => {
  // STC: TC-001 — Hallucination Grading Returns Faithfulness Score
  it('TC-001: grade returns a faithfulness score with issues list', async () => {
    const grader = new HallucinationGrader();
    const result = await grader.grade('The model has a 2k context window.', SOURCES);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.issues).toEqual([]);
  });

  it('uses default threshold 0.7 and 2s grading timeout (FSD 12.3/12.5)', () => {
    expect(FAITHFULNESS_THRESHOLD).toBe(0.7);
    expect(GRADE_TIMEOUT_MS).toBe(2000);
    const grader = new HallucinationGrader();
    expect(grader.threshold).toBe(0.7);
  });

  it('supports custom config', () => {
    const grader = new HallucinationGrader(computeFaithfulness, { threshold: 0.9, timeoutMs: 100 });
    expect(grader.threshold).toBe(0.9);
  });

  it('accepts an injected LLM grader function (DI)', async () => {
    const gradeFn = vi.fn(async () => ({ score: 0.92, issues: [] }));
    const grader = new HallucinationGrader(gradeFn as any);
    const result = await grader.grade('answer', SOURCES);
    expect(gradeFn).toHaveBeenCalledWith('answer', SOURCES);
    expect(result.score).toBe(0.92);
  });

  // GRADE_ERROR → score=0 (FSD 12.2)
  it('grader function throwing → GRADE_ERROR → score 0', async () => {
    const grader = new HallucinationGrader(() => {
      throw new Error('llm exploded');
    });
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('GRADE_ERROR');
  });

  it('invalid grader output → score 0', async () => {
    const grader = new HallucinationGrader(() => ({ score: NaN, issues: [] }) as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
  });

  // SEC-328-04 — strict GradeResult shape validation (fail-closed)
  it('SEC-328-04: non-object grader output → score 0', async () => {
    const grader = new HallucinationGrader(() => '0.9 looks valid' as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('invalid grader output');
  });

  it('SEC-328-04: array-shaped grader output → score 0', async () => {
    const grader = new HallucinationGrader(() => [{ score: 0.9, issues: [] }] as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('invalid grader output');
  });

  it('SEC-328-04: non-numeric score in shape → score 0', async () => {
    const grader = new HallucinationGrader(() => ({ score: '0.9', issues: [] }) as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('invalid grader output');
  });

  it('SEC-328-04: non-string issues element → score 0 (shape abuse)', async () => {
    const grader = new HallucinationGrader(() => ({ score: 0.9, issues: [42] }) as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('invalid grader output');
  });

  it('SEC-328-04: hostile grader issues[] is capped (memory amplification guard)', async () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `issue-${i}`);
    const grader = new HallucinationGrader(() => ({ score: 0.5, issues: huge }));
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(0.5);
    expect(result.issues.length).toBeLessThanOrEqual(100);
  });

  it('clamps and rounds out-of-range scores', async () => {
    const grader = new HallucinationGrader(() => ({ score: 1.5, issues: [] }) as any);
    const result = await grader.grade('answer', SOURCES);
    expect(result.score).toBe(1);
  });

  it('grading timeout resolves within the configured budget (<2s)', async () => {
    const hanging = () => new Promise<never>(() => {});
    const grader = new HallucinationGrader(hanging as any, { timeoutMs: 100 });
    const start = Date.now();
    const result = await grader.grade('answer', SOURCES);
    const elapsed = Date.now() - start;
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('GRADE_TIMEOUT');
    expect(elapsed).toBeLessThan(2000);
  });

  it('default grader completes well under 2s (FSD 12.5 latency)', async () => {
    const grader = new HallucinationGrader();
    const start = Date.now();
    await grader.grade('The model has a 2k context window.', SOURCES);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
