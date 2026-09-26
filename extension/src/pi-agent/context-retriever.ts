import { logger } from '../logger';
import { QueryRouter } from './query-router';
import type { QueryIntent } from './query-router';
import { FsDirLister, isExcludedPath } from './context-retrieval/file-exclusion-filter';
import { ProgressiveDisclosureManager } from './context-retrieval/progressive-disclosure';
import { Ranker } from './context-retrieval/ranker';
import { SummaryTreeBuilder } from './context-retrieval/summary-tree';
import { FsContentReader, SymbolOutlineExtractor } from './context-retrieval/symbol-outline-extractor';
import { TokenCounter } from './context-retrieval/token-counter';
import {
  DEFAULT_RETRIEVAL_CONFIG,
  RetrievalValidationError,
} from './context-retrieval/types';
import type { RetrievalConfig, RetrievalResult, ISearchProvider, IFileLister } from './context-retrieval/types';
import type { LargeQueryProcessor } from './map-reduce/large-query-processor';

export interface ContextRetrieverDeps {
  searchProvider: ISearchProvider;
  rootDir: string;
  config?: Partial<RetrievalConfig>;
  queryRouter?: QueryRouter;
  fileLister?: IFileLister;
  largeQueryProcessor?: LargeQueryProcessor;
}

export class ContextRetriever {
  private readonly config: RetrievalConfig;
  private readonly router: QueryRouter;
  private readonly ranker = new Ranker();
  private readonly disclosure: ProgressiveDisclosureManager;
  private readonly treeBuilder: SummaryTreeBuilder;

  constructor(private readonly deps: ContextRetrieverDeps) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...deps.config };
    this.router = deps.queryRouter ?? new QueryRouter();
    const counter = new TokenCounter();
    const extractor = new SymbolOutlineExtractor(counter, new FsContentReader());
    this.disclosure = new ProgressiveDisclosureManager({ counter, extractor, config: this.config });
    this.treeBuilder = new SummaryTreeBuilder({
      lister: deps.fileLister ?? new FsDirLister(),
      counter,
    });
  }

  async retrieve(query: string, topK: number = this.config.maxTopK): Promise<RetrievalResult> {
    const normalizedQuery = validateQuery(query);
    const limit = normalizeTopK(topK, this.config.maxTopK);
    const { intent } = this.router.classify(normalizedQuery);
    if (intent === 'LOCAL') {
      return this.retrieveLocal(normalizedQuery, limit, intent);
    }
    return this.retrieveGlobal(normalizedQuery, intent);
  }

  private async retrieveGlobal(query: string, intent: QueryIntent): Promise<RetrievalResult> {
    const processed = await this.tryLargeQuery(query, intent);
    if (processed) return processed;
    return this.buildSummaryTreeResult(query, intent);
  }

  private async tryLargeQuery(query: string, intent: QueryIntent): Promise<RetrievalResult | null> {
    if (!this.deps.largeQueryProcessor) return null;
    try {
      return await this.deps.largeQueryProcessor.process(query, intent);
    } catch (err) {
      logger.warn('Map-reduce processing failed, falling back to summary tree', {
        error: (err as Error).message,
      });
      return null;
    }
  }

  private async retrieveLocal(
    query: string,
    topK: number,
    intent: QueryIntent
  ): Promise<RetrievalResult> {
    try {
      const candidates = (await this.deps.searchProvider.search(query, topK)).slice(0, topK);
      const allowed = candidates.filter((candidate) => !isExcludedPath(candidate.filePath));
      if (allowed.length === 0) {
        return this.emptyResult(query, intent, 'No search results found');
      }
      const ranked = this.ranker.rankSymbols(allowed, query);
      const plan = this.disclosure.disclose(ranked);
      return {
        query,
        intent,
        contextFiles: plan.contextFiles,
        totalTokens: plan.totalTokens,
        tier: plan.tier,
      };
    } catch (err) {
      logger.warn('Context search failed, falling back to summary tree', {
        error: (err as Error).message,
      });
      return this.buildSummaryTreeResult(query, intent);
    }
  }

  private buildSummaryTreeResult(query: string, intent: QueryIntent): RetrievalResult {
    const tree = this.treeBuilder.build(this.deps.rootDir);
    return {
      query,
      intent,
      contextFiles: [],
      totalTokens: tree.tokens,
      tier: 'summary',
      summary: tree.text,
    };
  }

  private emptyResult(query: string, intent: QueryIntent, warning: string): RetrievalResult {
    logger.warn(`Context retrieval empty: ${warning}`, { query });
    return { query, intent, contextFiles: [], totalTokens: 0, tier: 'symbol', warning };
  }
}

function validateQuery(query: string): string {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new RetrievalValidationError('Query must be a non-empty string');
  }
  return query.trim();
}

function normalizeTopK(topK: number, maxTopK: number): number {
  if (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1) {
    throw new RetrievalValidationError(`topK must be an integer >= 1, received ${topK}`);
  }
  return Math.min(topK, maxTopK);
}
