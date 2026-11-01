import { TokenBudgetManager } from '../context/token-budget-manager.js';
import { chunkedReduce } from '../../modules/memory/llm/chunked-reduce.js';
import type { LLMMessage } from '../../modules/memory/llm/types.js';

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

export interface ReductionContext {
  llmService: { complete(messages: LLMMessage[], override?: any): Promise<{ content: string }> };
  buildPrompt: (chunk: string) => LLMMessage[];
  trigger: string;
  strategy: string;
  budget: number;
}

export class ReductionPipeline {
  static readonly MAX_REDUCE_ROUNDS = 3;
  static readonly MAX_CHUNKS_PER_RULE = 32;

  /**
   * Real map-reduce implementation using chunkedReduce.
   * Splits digest into chunks that fit within budget, processes each chunk,
   * then merges results iteratively until within budget or max rounds reached.
   */
  async reduce(
    ast: any,
    digest: string,
    trigger: string,
    budget: number,
    buildCtx: ReductionContext
  ): Promise<ReductionOutcome> {
    const report: MapReduceReport = {
      trigger,
      strategy: 'ast_sections_map_reduce',
      chunks: [],
      reduceRounds: 0,
      chunksCompacted: 0,
      tokensFreed: 0,
      pinnedLogicIntact: true,
    };

    // Check if already within budget
    const totalTokens = TokenBudgetManager.estimateTokens(digest);
    if (totalTokens <= budget) {
      report.chunks = [{ section: 'full', tokens: totalTokens, status: 'ok', attempts: 1 }];
      return { kind: 'success', text: digest, report };
    }

    // Split into chunks that fit within budget
    const chunks = this.splitByBudget(digest, budget);
    if (chunks.length === 0) {
      const err = new BudgetError('budget_error: no chunks generated', report, 0, 0);
      report.budgetError = { message: err.message, context: {} };
      return { kind: 'budget_error', report, error: err };
    }
    if (chunks.length > ReductionPipeline.MAX_CHUNKS_PER_RULE) {
      const err = new BudgetError('budget_error: too many chunks', report, 0, chunks.length);
      report.boundsHit = { chunksTried: chunks.length };
      report.budgetError = { message: err.message, context: { maxChunks: ReductionPipeline.MAX_CHUNKS_PER_RULE } };
      return { kind: 'budget_error', report, error: err };
    }

    // MAP phase: process each chunk
    let currentResults: string[] = [];
    let round = 0;

    while (round < ReductionPipeline.MAX_REDUCE_ROUNDS) {
      report.reduceRounds = round + 1;
      const roundChunks = round === 0 ? chunks : currentResults;
      const roundBudget = Math.floor(budget * 0.8); // leave headroom for merge

      const mapResults = await chunkedReduce<string, string>({
        chunks: roundChunks,
        mapFn: async (chunk, index) => {
          const chunkTokens = TokenBudgetManager.estimateTokens(chunk);
          const messages = buildCtx.buildPrompt(chunk);
          try {
            const response = await buildCtx.llmService.complete(messages);
            const result = response.content;
            report.chunks.push({
              section: `chunk_${index}`,
              tokens: TokenBudgetManager.estimateTokens(result),
              status: 'ok',
              attempts: 1,
            });
            return result;
          } catch (err) {
            report.chunks.push({
              section: `chunk_${index}`,
              tokens: chunkTokens,
              status: 'failed',
              attempts: 1,
            });
            throw err;
          }
        },
        mergeFn: (results) => results.join('\n\n'),
        maxRetriesPerChunk: 2,
        onChunkFailure: () => 'degrade',
      });

      currentResults = [mapResults];
      const mergedTokens = TokenBudgetManager.estimateTokens(mapResults);

      if (mergedTokens <= budget) {
        // MERGE phase successful — fits within budget
        report.chunksCompacted = roundChunks.length - 1;
        report.tokensFreed = totalTokens - mergedTokens;
        report.pinnedLogicIntact = true;
        return { kind: 'success', text: mapResults, report };
      }

      // Not within budget yet, continue to next reduce round
      // Split the merged result again for next round
      const nextChunks = this.splitByBudget(mapResults, roundBudget);
      if (nextChunks.length >= roundChunks.length) {
        // No progress, break
        break;
      }
      chunks.length = 0;
      chunks.push(...nextChunks);
      round++;
    }

    // Max rounds reached or no progress
    const err = new BudgetError('budget_error: reduction exhausted', report, round, chunks.length);
    report.boundsHit = { chunksTried: chunks.length, roundsTried: round };
    report.budgetError = { message: err.message, context: { finalChunks: chunks.length, finalTokens: TokenBudgetManager.estimateTokens(currentResults[0] || '') } };
    return { kind: 'budget_error', report, error: err };
  }

  /**
   * Split text into chunks that fit within token budget.
   * Tries to split on logical boundaries (newlines, sections).
   */
  private splitByBudget(text: string, budget: number): string[] {
    const tokens = TokenBudgetManager.estimateTokens(text);
    if (tokens <= budget) return [text];

    // Try to split on double newlines (paragraphs/sections)
    const sections = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const section of sections) {
      const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + section;
      if (TokenBudgetManager.estimateTokens(testChunk) <= budget) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        // If single section exceeds budget, hard-split it
        if (TokenBudgetManager.estimateTokens(section) > budget) {
          chunks.push(...this.hardSplit(section, budget));
          currentChunk = '';
        } else {
          currentChunk = section;
        }
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : this.hardSplit(text, budget);
  }

  /**
   * Hard split by character count when no logical boundaries work.
   */
  private hardSplit(text: string, budget: number): string[] {
    const maxChars = budget * 4; // ~4 chars per token
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
    return chunks;
  }
}