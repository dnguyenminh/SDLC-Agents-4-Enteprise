export type DisclosureTier = 'symbol' | 'chunk' | 'full' | 'summary' | 'map-reduce';

export interface SearchCandidate {
  name: string;
  filePath: string;
  kind: string;
  startLine?: number;
  signature?: string;
  docComment?: string;
  source: 'code_search' | 'mem_search';
}

export interface RankedSymbol extends SearchCandidate {
  rank: number;
  score: number;
}

export interface ContextFile {
  path: string;
  outline: string;
  tokens: number;
  tier: DisclosureTier;
}

export interface RetrievalResult {
  query: string;
  intent: import('../query-router').QueryIntent;
  contextFiles: ContextFile[];
  totalTokens: number;
  tier: DisclosureTier;
  summary?: string;
  warning?: string;
}

export interface ISearchProvider {
  search(query: string, topK: number): Promise<SearchCandidate[]>;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface DirPage {
  entries: DirEntry[];
  nextCursor?: number;
}

export interface IFileLister {
  listDir(dir: string, cursor: number, pageSize: number): DirPage;
}

export interface RetrievalConfig {
  maxTopK: number;
  tokenBudget: number;
  symbolTierTokens: number;
  chunkTierTokens: number;
  chunkLines: number;
  searchTimeoutMs: number;
  retryBackoffMs: number;
  pageSize: number;
}

export const EXCLUDED_DIRS: readonly string[] = ['.git', 'node_modules', 'out', 'dist'];

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxTopK: 20,
  tokenBudget: 6000,
  symbolTierTokens: 200,
  chunkTierTokens: 800,
  chunkLines: 80,
  searchTimeoutMs: 2000,
  retryBackoffMs: 200,
  pageSize: 100,
};

export class RetrievalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetrievalValidationError';
  }
}
