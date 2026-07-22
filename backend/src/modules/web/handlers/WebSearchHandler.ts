/**
 * Handler for the web_search tool.
 * Searches via SearXNG with DuckDuckGo fallback.
 * Results are cached in-memory (TTL: 10 min) per query+category+language key.
 */

import type { ToolResult } from '../../../types/tool.js';
import type { WebModuleConfig } from '../models/WebModuleConfig.js';
import { RateLimiter } from '../middleware/RateLimiter.js';
import { WebToolError } from '../models/WebError.js';
import { successResult, errorResult } from '../models/WebToolResult.js';
import { ResponseCache } from '../utils/ResponseCache.js';

interface SearchResult { title: string; url: string; snippet: string; }

function cacheKey(query: string, num: number, cat: string, lang: string): string {
  return `${lang}::${cat}::${num}::${query.toLowerCase().trim()}`;
}

export class WebSearchHandler {
  // Cache search results for 10 minutes — search results change slowly
  private cache = new ResponseCache<ToolResult>(10 * 60 * 1000, 300);

  constructor(private rateLimiter: RateLimiter, private config: WebModuleConfig) {}

  async handle(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = args.query as string;
      if (!query?.trim()) throw new WebToolError('INVALID_URL', 'Search query cannot be empty');
      const numResults = Math.min((args.num_results as number) || 5, 10);
      const category = (args.category as string) || 'general';
      const language = (args.language as string) || 'en';
      const noCache = args.no_cache === true;

      const key = cacheKey(query, numResults, category, language);
      if (!noCache) {
        const cached = this.cache.get(key);
        if (cached) return cached;
      }

      this.rateLimiter.consumeOrThrow('web_search');

      const results = await this.searchSearXNG(query, numResults, category, language)
        .catch(() => this.searchDuckDuckGo(query, numResults));

      const toolResult = successResult({ results, total_found: results.length, search_engine: 'searxng' });
      this.cache.set(key, toolResult);
      return toolResult;
    } catch (err) {
      if (err instanceof WebToolError) return errorResult(err);
      return errorResult(new WebToolError('TIMEOUT', (err as Error).message));
    }
  }

  private async searchSearXNG(query: string, num: number, cat: string, lang: string): Promise<SearchResult[]> {
    const url = `${this.config.searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=${cat}&language=${lang}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!res.ok) throw new Error(`SearXNG error: ${res.status}`);
    const data = await res.json() as { results: Array<{ title: string; url: string; content: string }> };
    return (data.results || []).slice(0, num).map(r => ({ title: r.title, url: r.url, snippet: r.content }));
  }

  private async searchDuckDuckGo(query: string, num: number): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!res.ok) throw new WebToolError('TIMEOUT', 'Search service temporarily unavailable');
    const data = await res.json() as { RelatedTopics: Array<{ Text: string; FirstURL: string }> };
    return (data.RelatedTopics || []).slice(0, num).map(r => ({
      title: r.Text?.slice(0, 60) || '',
      url: r.FirstURL || '',
      snippet: r.Text || '',
    }));
  }
}
