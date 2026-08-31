// KSA-286: Search Service — Execute search with score breakdown

import { AdminModuleDependencies } from '../index.js';

export interface SearchRequest {
  query: string;
  tier?: string;
  tags?: string[];
  limit?: number;
  includeScoreBreakdown?: boolean;
}

export function createSearchService(deps: AdminModuleDependencies) {
  const { kbEngine } = deps;

  return {
    search(request: SearchRequest) {
      try {
        const results = kbEngine?.search?.({
          query: request.query,
          tier: request.tier,
          tags: request.tags,
          limit: request.limit || 20,
          includeScoreBreakdown: request.includeScoreBreakdown !== false,
        }) || [];

        return {
          query: request.query,
          results: results.map((r: any) => ({
            entryId: r.entryId || r.id,
            title: r.title,
            content: r.content?.substring(0, 500),
            tier: r.tier,
            tags: r.tags || [],
            score: r.score || 0,
            scoreBreakdown: r.scoreBreakdown || undefined,
            createdAt: r.createdAt,
          })),
          total: results.length,
          searchTimeMs: 0,
        };
      } catch (e: any) {
        return { query: request.query, results: [], total: 0, searchTimeMs: 0, error: e?.message };
      }
    },
  };
}
