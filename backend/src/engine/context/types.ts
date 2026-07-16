/**
 * KSA-158/159/160: Shared types for AI Context tools.
 */

export interface AIContextParams {
  symbol: string;
  intent?: string;
  token_budget?: number;
  caller_depth?: number;
}

export interface AIContextResponse {
  symbol: string;
  file_path: string;
  kind: string;
  intent: string;
  context: Record<string, any>;
  metadata: {
    budget_used: number;
    budget_total: number;
    sections_included: string[];
    sections_omitted: string[];
    query_time_ms: number;
  };
}

export interface EditContextParams {
  symbol: string;
  include_callers?: boolean;
  include_tests?: boolean;
  include_memories?: boolean;
  include_git?: boolean;
  token_budget?: number;
  caller_depth?: number;
}

export interface EditContextResult {
  symbol: string;
  file: string;
  line: number;
  kind: string;
  source: string;
  signature: string | null;
  callers?: CallerContext[];
  tests?: TestContext[];
  dependencies?: DependencyContext[];
  memories?: MemoryContext[];
  git_history?: GitCommit[];
  siblings?: SiblingContext[];
  metadata: {
    tokenCount: number;
    tokenBudget: number;
    sectionsIncluded: string[];
    sectionsExcluded: string[];
    queryTimeMs: number;
  };
}

export interface CallerContext {
  symbol: string;
  file: string;
  line: number;
  context: string;
}

export interface TestContext {
  file: string;
  testName: string;
  source: string;
}

export interface DependencyContext {
  file: string;
  symbols: string[];
  direction: 'imports' | 'imported_by';
}

export interface MemoryContext {
  id: number;
  type: string;
  summary: string;
}

export interface GitCommit {
  hash: string;
  message: string;
}

export interface SiblingContext {
  name: string;
  kind: string;
  signature: string | null;
  line: number;
}

export interface CuratedContextParams {
  query: string;
  max_tokens?: number;
  scope?: string;
  modules?: string[];
  languages?: string[];
  include_source?: boolean;
  include_memory?: boolean;
  include_graph?: boolean;
  source_weights?: SourceWeights;
  /** SA4E-41: tenant scope for code/graph branches (fail-closed when absent). */
  projectId?: string;
}

export interface SourceWeights {
  code: number;
  memory: number;
  graph: number;
}

export interface CuratedContextResponse {
  query: string;
  sections: ContextSection[];
  metadata: {
    tokens_used: number;
    tokens_budget: number;
    sources_queried: string[];
    total_candidates: number;
    results_returned: number;
    execution_time_ms: number;
  };
}

export interface ContextSection {
  title: string;
  source: 'code' | 'memory' | 'graph';
  items: ContextItem[];
}

export interface ContextItem {
  name: string;
  kind?: string;
  file?: string;
  line?: number;
  relevance: number;
  detail: 'full' | 'signature' | 'reference';
  content: string;
  relationship?: string;
}

export interface QueryAnalysis {
  originalQuery: string;
  keywords: string[];
  symbolCandidates: string[];
  phrases: string[];
  ftsQuery: string;
}

export interface MergedResult {
  id?: number;
  name: string;
  kind?: string;
  file?: string;
  line?: number;
  signature?: string;
  source_code?: string;
  content?: string;
  relevance_score: number;
  sources: string[];
  relationship?: string;
}
