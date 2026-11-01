import { TokenBudgetManager } from '../context/token-budget-manager.js';
import { chunkedReduce } from '../../modules/memory/llm/chunked-reduce.js';
import type { LLMMessage } from '../../modules/memory/llm/types.js';

export class BudgetError extends Error {
  constructor(public message: string, public report: MapReduceReport, public roundsTried = 0, public chunksTried = 0) {
    super(message); this.name = 'BudgetError';
  }
}

export interface MapReduceReport {
  trigger: string; strategy: string;
  chunks: Array<{ section: string; tokens: number; status: 'ok' | 'failed'; attempts: number }>;
  reduceRounds: number; chunksCompacted: number; tokensFreed: number; pinnedLogicIntact: boolean;
  boundsHit?: { chunksTried?: number; roundsTried?: number };
  budgetError?: { message: string; context: Record<string, unknown> };
}

export interface ReductionOutcome {
  kind: 'success' | 'budget_error'; text?: string; report: MapReduceReport; error?: BudgetError;
}

export interface ReductionContext {
  llmService: { complete(messages: LLMMessage[], override?: any): Promise<{ content: string }> };
  buildPrompt: (chunk: string) => LLMMessage[]; trigger: string; strategy: string; budget: number;
}

export class ReductionPipeline {
  static readonly MAX_REDUCE_ROUNDS = 3;
  static readonly MAX_CHUNKS_PER_RULE = 32;

  async reduce(ast: any, digest: string, trigger: string, budget: number, buildCtx: ReductionContext): Promise<ReductionOutcome> {
    const report: MapReduceReport = { trigger, strategy: 'ast_sections_map_reduce', chunks: [], reduceRounds: 0, chunksCompacted: 0, tokensFreed: 0, pinnedLogicIntact: true };
    const totalTokens = TokenBudgetManager.estimateTokens(digest);
    if (totalTokens <= budget) return { kind: 'success', text: digest, report: { ...report, chunks: [{ section: 'full', tokens: totalTokens, status: 'ok', attempts: 1 }] } };

    const chunks = this.splitByBudget(digest, budget);
    if (!chunks.length) return this.budgetErr(report, 'budget_error: no chunks generated', 0, 0);
    if (chunks.length > ReductionPipeline.MAX_CHUNKS_PER_RULE) return this.budgetErr(report, 'budget_error: too many chunks', 0, chunks.length, { maxChunks: ReductionPipeline.MAX_CHUNKS_PER_RULE });

    let currentResults: string[] = [];
    for (let round = 0; round < ReductionPipeline.MAX_REDUCE_ROUNDS; round++) {
      report.reduceRounds = round + 1;
      const roundChunks = round === 0 ? chunks : currentResults;
      const roundBudget = Math.floor(budget * 0.8);
      const mapResults = await chunkedReduce<string, string>({
        chunks: roundChunks, mapFn: async (chunk, index) => {
          const chunkTokens = TokenBudgetManager.estimateTokens(chunk);
          const messages = buildCtx.buildPrompt(chunk);
          try {
            const response = await buildCtx.llmService.complete(messages);
            report.chunks.push({ section: `chunk_${index}`, tokens: TokenBudgetManager.estimateTokens(response.content), status: 'ok', attempts: 1 });
            return response.content;
          } catch (err) {
            report.chunks.push({ section: `chunk_${index}`, tokens: chunkTokens, status: 'failed', attempts: 1 });
            throw err;
          }
        }, mergeFn: (r) => r.join('\n\n'), maxRetriesPerChunk: 2, onChunkFailure: () => 'degrade',
      });
      currentResults = [mapResults];
      const mergedTokens = TokenBudgetManager.estimateTokens(mapResults);
      if (mergedTokens <= budget) return { kind: 'success', text: mapResults, report: { ...report, chunksCompacted: roundChunks.length - 1, tokensFreed: totalTokens - mergedTokens } };
      const nextChunks = this.splitByBudget(mapResults, roundBudget);
      if (nextChunks.length >= roundChunks.length) break;
      chunks.length = 0; chunks.push(...nextChunks);
    }
    return this.budgetErr(report, 'budget_error: reduction exhausted', report.reduceRounds, chunks.length, { finalChunks: chunks.length, finalTokens: TokenBudgetManager.estimateTokens(currentResults[0] || '') });
  }

  private budgetErr(report: MapReduceReport, msg: string, rounds: number, chunksTried: number, ctx: Record<string, unknown> = {}): ReductionOutcome {
    const err = new BudgetError(msg, report, rounds, chunksTried);
    report.boundsHit = { chunksTried, roundsTried: rounds };
    report.budgetError = { message: msg, context: ctx };
    return { kind: 'budget_error', report, error: err };
  }

  private splitByBudget(text: string, budget: number): string[] {
    const tokens = TokenBudgetManager.estimateTokens(text);
    if (tokens <= budget) return [text];
    const sections = text.split(/\n\s*\n/); const chunks: string[] = []; let currentChunk = '';
    for (const section of sections) {
      const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + section;
      if (TokenBudgetManager.estimateTokens(testChunk) <= budget) currentChunk = testChunk;
      else {
        if (currentChunk) chunks.push(currentChunk);
        if (TokenBudgetManager.estimateTokens(section) > budget) chunks.push(...this.hardSplit(section, budget));
        else currentChunk = section;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks.length ? chunks : this.hardSplit(text, budget);
  }

  private hardSplit(text: string, budget: number): string[] {
    const maxChars = budget * 4; const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) chunks.push(text.slice(i, i + maxChars));
    return chunks;
  }
}