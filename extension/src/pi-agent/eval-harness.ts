import { logger } from '../logger';

export interface EvalCase {
  id: string;
  query: string;
  expectedIntent: string;
  expectedAnswerKeywords: string[];
}

export interface EvalCaseResult {
  id: string;
  keywordCoverage: number;
  latencyMs: number;
  tokensSaved?: number;
  error?: string;
}

export interface EvalMetrics {
  modelId: string;
  total: number;
  evaluated: number;
  skipped: number;
  faithfulness: number;
  taskSuccess: number;
  avgLatencyMs: number;
  tokensSaved: number;
}

export interface PiEvalSession {
  prompt(query: string): Promise<string>;
}

export type EvalRunner = (query: string) => Promise<{ answer: string; tokensSaved?: number }>;

export const TASK_SUCCESS_COVERAGE = 0.8;
export const SMALL_BASELINE_RATIO = 0.8;

export const DEFAULT_GOLDEN_DATASET: EvalCase[] = [
  { id: 'greet-001', query: 'Say hello to the user.', expectedIntent: 'greeting', expectedAnswerKeywords: ['hello'] },
  { id: 'math-002', query: 'What is 2 + 3? Answer with the number only.', expectedIntent: 'math', expectedAnswerKeywords: ['5'] },
  { id: 'tool-003', query: 'List the files in the workspace.', expectedIntent: 'tool-use', expectedAnswerKeywords: ['file'] },
  { id: 'code-004', query: 'Write a TypeScript function that adds two numbers.', expectedIntent: 'coding', expectedAnswerKeywords: ['function', 'add'] },
  { id: 'intent-005', query: 'Summarize the intent of this conversation.', expectedIntent: 'summarization', expectedAnswerKeywords: ['intent'] },
];

export function keywordCoverage(answer: string, keywords: string[]): number {
  if (keywords.length === 0) {
    return 1;
  }
  const text = answer.toLowerCase();
  const hits = keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length;
  return hits / keywords.length;
}

export class EvalHarness {
  constructor(
    private readonly runner: EvalRunner,
    private readonly dataset: EvalCase[] = DEFAULT_GOLDEN_DATASET
  ) {}

  async runEval(modelId: string): Promise<EvalMetrics> {
    const results: EvalCaseResult[] = [];
    let tokensSaved = 0;
    for (const evalCase of this.dataset) {
      const result = await this.runCase(evalCase);
      results.push(result);
      tokensSaved += result.tokensSaved ?? 0;
    }
    return EvalHarness.buildMetrics(modelId, results, tokensSaved);
  }

  private async runCase(evalCase: EvalCase): Promise<EvalCaseResult> {
    const started = performance.now();
    try {
      const output = await this.runner(evalCase.query);
      return {
        id: evalCase.id,
        keywordCoverage: keywordCoverage(output.answer, evalCase.expectedAnswerKeywords),
        latencyMs: performance.now() - started,
        tokensSaved: output.tokensSaved,
      };
    } catch (err) {
      logger.warn('EVAL_ERROR - skipping case', { id: evalCase.id, error: (err as Error).message });
      return {
        id: evalCase.id,
        keywordCoverage: 0,
        latencyMs: performance.now() - started,
        error: (err as Error).message,
      };
    }
  }

  static buildMetrics(modelId: string, results: EvalCaseResult[], tokensSaved: number): EvalMetrics {
    const evaluated = results.filter((r) => !r.error);
    const skipped = results.length - evaluated.length;
    const mean = evaluated.length > 0
      ? evaluated.reduce((sum, r) => sum + r.keywordCoverage, 0) / evaluated.length
      : 0;
    const successCount = evaluated.filter((r) => r.keywordCoverage >= TASK_SUCCESS_COVERAGE).length;
    return {
      modelId,
      total: results.length,
      evaluated: evaluated.length,
      skipped,
      faithfulness: mean,
      taskSuccess: evaluated.length > 0 ? successCount / evaluated.length : 0,
      avgLatencyMs: results.length > 0 ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length : 0,
      tokensSaved,
    };
  }

  static compareWithBaseline(small: EvalMetrics, baseline: EvalMetrics): { pass: boolean; ratio: number } {
    const ratio = baseline.taskSuccess > 0 ? small.taskSuccess / baseline.taskSuccess : 1;
    return { pass: ratio > SMALL_BASELINE_RATIO, ratio };
  }
}

export function createSessionEvalRunner(session: PiEvalSession): EvalRunner {
  return async (query: string) => ({ answer: await session.prompt(query) });
}
