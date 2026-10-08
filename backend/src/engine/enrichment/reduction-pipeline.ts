import { TokenBudgetManager } from '../context/token-budget-manager.js';

export class BudgetError extends Error {
  report: MapReduceReport;
  roundsTried: number;
  chunksTried: number;
  constructor(message: string, report: MapReduceReport, roundsTried = 0, chunksTried = 0) {
    super(message);
    this.name = 'BudgetError';
    this.report = report;
    this.roundsTried = roundsTried;
    this.chunksTried = chunksTried;
  }
}

export interface MapReduceReport {
  trigger: string;
  strategy: string;
  chunks: Array<{ section: string; tokens: number; status: 'ok' | 'failed'; attempts: number }>;
  reduceRounds: number;
  chunksCompacted: number;
  tokensFreed: number;
  pinnedLogicIntact: boolean;
  boundsHit?: { chunksTried?: number; roundsTried?: number };
  budgetError?: { message: string; context: Record<string, unknown> };
}

export interface ReductionOutcome {
  kind: 'success' | 'budget_error';
  text?: string;
  report: MapReduceReport;
  error?: BudgetError;
}

export class ReductionPipeline {
  static readonly MAX_REDUCE_ROUNDS = 3;
  static readonly MAX_CHUNKS_PER_RULE = 32;

  async reduce(ast: any, digest: string, trigger: string, budget: number, buildCtx: any): Promise<ReductionOutcome> {
    const report: MapReduceReport = {
      trigger,
      strategy: 'ast_sections_map_reduce',
      chunks: [],
      reduceRounds: 0,
      chunksCompacted: 0,
      tokensFreed: 0,
      pinnedLogicIntact: true,
    };
    // Simplified implementation
    const tokens = TokenBudgetManager.estimateTokens(digest);
    if (tokens <= budget) {
      report.chunks = [{ section: 'full', tokens, status: 'ok', attempts: 1 }];
      return { kind: 'success', text: digest, report };
    }
    // Fail fast for now
    const err = new BudgetError('budget_error: reduction exhausted', report, 0, 0);
    report.budgetError = { message: err.message, context: {} };
    return { kind: 'budget_error', report, error: err };
  }
}
