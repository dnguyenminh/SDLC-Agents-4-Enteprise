import { logger } from '../logger';
import { detectModelTier, type ModelTier } from './model-tier';
import { HallucinationGrader } from './hallucination-grader';
import { withTimeout } from './async-timeout';
import type { SourceCitation } from './faithfulness';

export type VerifyStrategy = 'self-verify' | 'external-grader';

export interface VerifyResult {
  verified: boolean;
  revisedAnswer: string;
  score: number;
  attempts: number;
  strategy: VerifyStrategy;
}

export interface VerifyConfig {
  maxRetries: number;
  timeoutMs: number;
}

export const DEFAULT_VERIFY_CONFIG: VerifyConfig = { maxRetries: 1, timeoutMs: 4000 };

export interface VerificationDeps {
  regenerate?: (answer: string) => string | Promise<string>;
  config?: Partial<VerifyConfig>;
}

interface Attempt {
  answer: string;
  score: number;
}

/**
 * Small models are unreliable at self-verification → direct routing + external grader.
 * Medium/large/unknown tiers keep the in-loop verify.
 */
export function resolveVerifyStrategy(modelTier: ModelTier | null): VerifyStrategy {
  return modelTier === 'small' ? 'external-grader' : 'self-verify';
}

export class VerificationLoop {
  private readonly deps: VerificationDeps;
  private readonly config: VerifyConfig;

  constructor(
    private readonly grader: HallucinationGrader,
    deps: VerificationDeps = {}
  ) {
    this.deps = deps;
    this.config = { ...DEFAULT_VERIFY_CONFIG, ...deps.config };
  }

  async verify(answer: string, sources: SourceCitation[], modelTier: ModelTier | null = null): Promise<VerifyResult> {
    const strategy = resolveVerifyStrategy(modelTier);
    try {
      const first = await this.grade(answer, sources);
      const { best, attempts } = await this.retryUntilPassOrExhaust(first, sources);
      return {
        verified: best.score >= this.grader.threshold,
        revisedAnswer: best.answer,
        score: best.score,
        attempts,
        strategy,
      };
    } catch (err) {
      // VERIFY_TIMEOUT → return original answer
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('VERIFY_TIMEOUT → return original', { message });
      return { verified: false, revisedAnswer: answer, score: 0, attempts: 0, strategy };
    }
  }

  private async grade(answer: string, sources: SourceCitation[]): Promise<Attempt> {
    const { score } = await withTimeout(this.grader.grade(answer, sources), this.config.timeoutMs, 'VERIFY_TIMEOUT');
    return { answer, score };
  }

  private async retryUntilPassOrExhaust(first: Attempt, sources: SourceCitation[]): Promise<{ best: Attempt; attempts: number }> {
    let best = first;
    let current = first;
    let attempts = 1;
    while (best.score < this.grader.threshold && attempts <= this.config.maxRetries && this.deps.regenerate) {
      current = await this.grade(await this.deps.regenerate(current.answer), sources);
      if (current.score > best.score) best = current;
      attempts += 1;
    }
    return { best, attempts };
  }
}

export interface VerifyAfterToolsParams extends VerificationDeps {
  answer: string;
  sources: SourceCitation[];
  modelId?: string;
  grader?: HallucinationGrader;
}

/**
 * Post-execute_tools hook: routes by model tier and runs the verification loop.
 * Execute Tools → Verification Loop → Hallucination Grader → Faithfulness Score → Retry.
 */
export async function verifyAfterExecuteTools(params: VerifyAfterToolsParams): Promise<VerifyResult> {
  const grader = params.grader ?? new HallucinationGrader();
  const loop = new VerificationLoop(grader, { regenerate: params.regenerate, config: params.config });
  const tier = params.modelId ? detectModelTier(params.modelId) : null;
  return loop.verify(params.answer, params.sources, tier);
}
