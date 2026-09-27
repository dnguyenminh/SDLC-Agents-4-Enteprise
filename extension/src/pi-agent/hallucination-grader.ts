import { logger } from '../logger';
import { computeFaithfulness, type GradeResult, type SourceCitation } from './faithfulness';
import { withTimeout } from './async-timeout';

export const FAITHFULNESS_THRESHOLD = 0.7;
export const GRADE_TIMEOUT_MS = 2000;
/** SEC-328-04 — cap issues[] from a hostile grader to bound memory/metrics amplification. */
export const MAX_GRADE_ISSUES = 100;

export interface GraderConfig {
  threshold: number;
  timeoutMs: number;
}

export type GradeFn = (answer: string, sources: SourceCitation[]) => GradeResult | Promise<GradeResult>;

/**
 * SEC-328-04 — strict GradeResult shape validation.
 * A grader function returning anything other than an object with a finite
 * numeric `score` and a string-array `issues` is invalid → score = 0
 * (fail-closed: a compromised grader cannot produce a passing score by
 * shape abuse).
 */
export function isGradeResultShape(value: unknown): value is GradeResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.score !== 'number' || !Number.isFinite(candidate.score)) {
    return false;
  }
  if (!Array.isArray(candidate.issues)) {
    return false;
  }
  return candidate.issues.every((issue) => typeof issue === 'string');
}

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

  private sanitize(result: unknown): GradeResult {
    if (!isGradeResultShape(result)) {
      return { score: 0, issues: ['GRADE_ERROR: invalid grader output'] };
    }
    return {
      score: Math.min(1, Math.max(0, Math.round(result.score * 100) / 100)),
      issues: result.issues.slice(0, MAX_GRADE_ISSUES),
    };
  }
}
