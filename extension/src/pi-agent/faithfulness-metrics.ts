import type { HallucinationGrader } from './hallucination-grader';
import type { SourceCitation } from './faithfulness';

export interface GoldenCase {
  id: string;
  answer: string;
  sources: SourceCitation[];
}

export interface GoldenCaseResult {
  id: string;
  score: number;
  passed: boolean;
}

export interface GoldenSetReport {
  total: number;
  passed: number;
  meanFaithfulness: number;
  results: GoldenCaseResult[];
}

export async function evaluateGoldenSet(
  grader: HallucinationGrader,
  cases: GoldenCase[]
): Promise<GoldenSetReport> {
  const results: GoldenCaseResult[] = [];
  for (const goldenCase of cases) {
    const { score } = await grader.grade(goldenCase.answer, goldenCase.sources);
    results.push({ id: goldenCase.id, score, passed: score >= grader.threshold });
  }
  return buildReport(results);
}

function buildReport(results: GoldenCaseResult[]): GoldenSetReport {
  const total = results.length;
  const meanFaithfulness =
    total === 0 ? 0 : Math.round((results.reduce((sum, r) => sum + r.score, 0) / total) * 100) / 100;
  return {
    total,
    passed: results.filter((r) => r.passed).length,
    meanFaithfulness,
    results,
  };
}
