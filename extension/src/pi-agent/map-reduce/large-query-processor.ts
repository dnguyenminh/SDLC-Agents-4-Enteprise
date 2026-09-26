import { logger } from '../../logger';
import { DEFAULT_RETRIEVAL_CONFIG } from '../context-retrieval/types';
import type { ContextFile, RetrievalResult } from '../context-retrieval/types';
import { TokenCounter } from '../context-retrieval/token-counter';
import type { QueryIntent } from '../query-router';
import type { FileScanner } from '../context-retrieval/file-scanner';
import type { MapReduceConfig } from './types';
import { DEFAULT_MAP_REDUCE_CONFIG } from './types';
import type { MapReduceOrchestrator } from './map-reduce-orchestrator';
import type { MapReduceResult } from './types';

export interface LargeQueryProcessorDeps {
  orchestrator: MapReduceOrchestrator;
  scanner: FileScanner;
  rootDir: string;
  config?: Partial<MapReduceConfig>;
  minFiles?: number;
}

export const LARGE_QUERY_INTENTS: readonly QueryIntent[] = ['GLOBAL', 'STRUCTURAL'];

export class LargeQueryProcessor {
  private readonly config: MapReduceConfig;
  private readonly minFiles: number;
  private readonly counter = new TokenCounter();

  constructor(private readonly deps: LargeQueryProcessorDeps) {
    this.config = { ...DEFAULT_MAP_REDUCE_CONFIG, ...deps.config };
    this.minFiles = deps.minFiles ?? this.config.batchSize + 1;
  }

  async process(query: string, intent: QueryIntent): Promise<RetrievalResult | null> {
    if (!LARGE_QUERY_INTENTS.includes(intent)) return null;
    const files = this.deps.scanner.listSourceFiles(this.deps.rootDir, {
      maxFiles: this.config.maxFiles,
    });
    if (files.length < this.minFiles) return null;
    const result = await this.deps.orchestrator.run(query, files);
    if (result.partials.length === 0) {
      logger.warn('Map-reduce produced no partial summaries');
      return null;
    }
    return this.toRetrievalResult(query, intent, result);
  }

  private toRetrievalResult(
    query: string,
    intent: QueryIntent,
    result: MapReduceResult
  ): RetrievalResult {
    const budget = DEFAULT_RETRIEVAL_CONFIG.tokenBudget;
    const answerTokens = this.counter.estimate(result.answer);
    const contextFiles = this.buildContextFiles(result, Math.max(0, budget - answerTokens));
    return {
      query,
      intent,
      contextFiles,
      totalTokens: answerTokens + contextFiles.reduce((sum, file) => sum + file.tokens, 0),
      tier: 'map-reduce',
      summary: result.answer,
    };
  }

  private buildContextFiles(result: MapReduceResult, budget: number): ContextFile[] {
    const files: ContextFile[] = [];
    let used = 0;
    for (const partial of result.partials) {
      const tokens = this.counter.estimate(partial.summary);
      if (used + tokens > budget) continue;
      used += tokens;
      files.push({
        path: `map-reduce://${partial.batchId}`,
        outline: partial.summary,
        tokens,
        tier: 'map-reduce',
      });
    }
    return files;
  }
}
