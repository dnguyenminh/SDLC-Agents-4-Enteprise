/**
 * ToolSearchService — abstraction for semantic tool search.
 * DIP fix: OrchestrationModule depends on this interface, not on MemoryModule internals.
 * Implementation (MemoryToolSearchService) is wired at startup via registry.
 */

export interface ToolSearchResult {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  score: number;
}

export interface ToolSearchService {
  /** Search available tools by semantic query, returning top-k results sorted by score. */
  search(query: string, topK: number): Promise<ToolSearchResult[]>;
}
