/**
 * KSA-160: Curated Context Service — NL query → parallel search → RRF merge → budget allocation.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { QueryAnalyzer } from './query-analyzer.js';
import { RRFMerger } from './rrf-merger.js';
import { BudgetAllocator } from './budget-allocator.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { GraphTraverser } from '../graph/traverser.js';
import { QueryLayer } from '../query/query-layer.js';
import { CuratedContextParams, CuratedContextResponse } from './types.js';
import { searchCode, searchMemory, expandGraph, formatSections } from './curated-helpers.js';

export class CuratedContextService {
  private analyzer: QueryAnalyzer;
  private merger: RRFMerger;
  private allocator: BudgetAllocator;
  private adapter: DatabaseAdapter;
  private queryLayer: QueryLayer;
  private traverser: GraphTraverser;
  private resolver: SymbolResolver;

  constructor(
    adapter: DatabaseAdapter,
    queryLayer: QueryLayer,
    traverser: GraphTraverser,
    resolver: SymbolResolver
  ) {
    this.analyzer = new QueryAnalyzer();
    this.merger = new RRFMerger();
    this.allocator = new BudgetAllocator();
    this.adapter = adapter;
    this.queryLayer = queryLayer;
    this.traverser = traverser;
    this.resolver = resolver;
  }

  /** Execute curated context search with NL query. */
  async getContext(params: CuratedContextParams): Promise<CuratedContextResponse> {
    const startTime = Date.now();
    const {
      query,
      max_tokens = 4000,
      include_source = true,
      include_memory = true,
      include_graph = true,
      source_weights,
      projectId
    } = params;

    const analysis = this.analyzer.analyze(query);

    const [codeResults, memoryResults] = await Promise.all([
      include_source ? searchCode(analysis, this.queryLayer, this.resolver, projectId) : Promise.resolve({ source: 'code', results: [] }),
      include_memory ? searchMemory(analysis, this.adapter, projectId) : Promise.resolve({ source: 'memory', results: [] })
    ]);

    let graphResults = { source: 'graph', results: [] as any[] };
    if (include_graph && codeResults.results.length > 0) {
      graphResults = await expandGraph(codeResults.results.slice(0, 5), this.traverser);
    }

    const merged = this.merger.merge(
      { code: codeResults, memory: memoryResults, graph: graphResults },
      source_weights
    );

    const allocated = this.allocator.allocate(merged, max_tokens);

    const sections = formatSections(allocated);
    const tokensUsed = allocated.reduce((sum, r) => sum + r.tokens, 0) + 100;

    return {
      query,
      sections,
      metadata: {
        tokens_used: tokensUsed,
        tokens_budget: max_tokens,
        sources_queried: [
          ...(include_source ? ['code'] : []),
          ...(include_memory ? ['memory'] : []),
          ...(include_graph ? ['graph'] : [])
        ],
        total_candidates: codeResults.results.length + memoryResults.results.length + graphResults.results.length,
        results_returned: allocated.length,
        execution_time_ms: Date.now() - startTime
      }
    };
  }
}
