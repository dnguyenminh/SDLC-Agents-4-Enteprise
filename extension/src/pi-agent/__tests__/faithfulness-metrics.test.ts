import { describe, it, expect } from 'vitest';
import { HallucinationGrader } from '../hallucination-grader';
import { evaluateGoldenSet, type GoldenCase } from '../faithfulness-metrics';

const CONTEXT_SOURCES = [
  { path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window' },
];

const GOLDEN_SET: GoldenCase[] = [
  { id: 'case-1', answer: 'The model has a 2k context window.', sources: CONTEXT_SOURCES },
  { id: 'case-2', answer: 'The model has a 2k context window. The billing tier costs 99 dollars monthly.', sources: CONTEXT_SOURCES },
  { id: 'case-3', answer: 'The API costs 99 dollars per month with premium plans.', sources: CONTEXT_SOURCES },
];

describe('evaluateGoldenSet', () => {
  // STC: TC-102 — Faithfulness Metric On Golden Set (run eval → metrics reported)
  it('TC-102: reports faithfulness metrics for the golden set', async () => {
    const grader = new HallucinationGrader();
    const report = await evaluateGoldenSet(grader, GOLDEN_SET);
    expect(report.total).toBe(3);
    expect(report.passed).toBe(1);
    expect(report.meanFaithfulness).toBeGreaterThan(0);
    expect(report.meanFaithfulness).toBeLessThanOrEqual(1);
    expect(report.results).toHaveLength(3);
  });

  // STC: TC-302 — Faithfulness Metric Reported
  it('TC-302: grounded cases pass, hallucinated cases fail at threshold 0.7', async () => {
    const grader = new HallucinationGrader();
    const report = await evaluateGoldenSet(grader, GOLDEN_SET);
    const byId = new Map(report.results.map((r) => [r.id, r]));
    expect(byId.get('case-1')!.passed).toBe(true);
    expect(byId.get('case-3')!.passed).toBe(false);
    expect(grader.threshold).toBe(0.7);
  });

  it('empty golden set reports zeroed metrics gracefully', async () => {
    const grader = new HallucinationGrader();
    const report = await evaluateGoldenSet(grader, []);
    expect(report.total).toBe(0);
    expect(report.passed).toBe(0);
    expect(report.meanFaithfulness).toBe(0);
    expect(report.results).toEqual([]);
  });

  it('works with a custom-threshold grader', async () => {
    const grader = new HallucinationGrader(undefined, { threshold: 0.99 });
    const report = await evaluateGoldenSet(grader, GOLDEN_SET);
    expect(report.passed).toBeLessThanOrEqual(1);
  });
});
