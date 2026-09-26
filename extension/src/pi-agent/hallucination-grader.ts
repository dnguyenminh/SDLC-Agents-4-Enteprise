import { logger } from '../logger';
import { computeFaithfulness, type GradeResult, type SourceCitation } from './faithfulness';
import { withTimeout } from './async-timeout';

export const FAITHFULNESS_THRESHOLD = 0.7;
export const GRADE_TIMEOUT_MS = 2000;

export interface GraderConfig {
  threshold: number;
  timeoutMs: number;
}

export type GradeFn = (answer: string, sources: SourceCitation[]) => GradeResult | Promise<GradeResult>;

/**
 * Grades answers for hallucinations against cited sources.
 * GRADE_ERROR (grader failure/timeout/invalid output) → score = 0.
 */
export class HallucinationGrader {
  readonly threshold: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly gradeFn: GradeFn = computeFaithfulness,
    config: Partial<GraderConfig> = {}
  ) {
    this.threshold = config.threshold ?? FAITHFULNESS_THRESHOLD;
    this.timeoutMs = config.timeoutMs ?? GRADE_TIMEOUT_MS;
  }

  async grade(answer: string, sources: SourceCitation[]): Promise<GradeResult> {
    try {
      const raw = await withTimeout(Promise.resolve(this.gradeFn(answer, sources)), this.timeoutMs, 'GRADE_TIMEOUT');
      return this.sanitize(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('GRADE_ERROR → score=0', { message });
      return { score: 0, issues: [`GRADE_ERROR: ${message}`] };
    }
  }

  private sanitize(result: GradeResult | null | undefined): GradeResult {
    if (!result || typeof result.score !== 'number' || !Number.isFinite(result.score) || !Array.isArray(result.issues)) {
      return { score: 0, issues: ['GRADE_ERROR: invalid grader output'] };
    }
    return {
      score: Math.min(1, Math.max(0, Math.round(result.score * 100) / 100)),
      issues: result.issues,
    };
  }
}
