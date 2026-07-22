/**
 * Handler for the fetch_url tool.
 * Fetches content from URLs with modes: full, truncated, selective.
 * Responses are cached in-memory (TTL: 5 min) to avoid redundant external calls.
 */

import type { ToolResult } from '../../../types/tool.js';
import type { WebModuleConfig } from '../models/WebModuleConfig.js';
import { SsrfGuard } from '../middleware/SsrfGuard.js';
import { RateLimiter } from '../middleware/RateLimiter.js';
import { ContentTruncator } from '../middleware/ContentTruncator.js';
import { HtmlExtractor } from '../utils/HtmlExtractor.js';
import { validateUrl } from '../utils/UrlValidator.js';
import { WebToolError } from '../models/WebError.js';
import { successResult, errorResult } from '../models/WebToolResult.js';
import { ResponseCache } from '../utils/ResponseCache.js';

/** Cache key: url + mode + selector (content varies by these params). */
function cacheKey(url: string, mode: string, selector?: string): string {
  return `${mode}::${selector || ''}::${url}`;
}

export class FetchUrlHandler {
  private htmlExtractor = new HtmlExtractor();
  // Cache fetch results for 5 minutes to avoid hammering the same URL
  private cache = new ResponseCache<ToolResult>(5 * 60 * 1000, 200);

  constructor(
    private ssrfGuard: SsrfGuard,
    private rateLimiter: RateLimiter,
    private truncator: ContentTruncator,
    private config: WebModuleConfig,
  ) {}

  async handle(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = args.url as string;
      const mode = (args.mode as string) || 'full';
      const maxLength = args.max_length as number | undefined;
      const selector = args.selector as string | undefined;
      // no_cache: bypass cache when caller explicitly requests fresh content
      const noCache = args.no_cache === true;

      validateUrl(url);
      await this.ssrfGuard.validate(url);

      const key = cacheKey(url, mode, selector);
      if (!noCache) {
        const cached = this.cache.get(key);
        if (cached) return cached;
      }

      this.rateLimiter.consumeOrThrow('fetch_url');

      const response = await this.fetchWithTimeout(url);
      const body = await response.text();
      const content = this.processContent(body, mode, maxLength, selector);
      const result = this.truncator.truncate(content, maxLength);

      const toolResult = successResult({
        content: result.content,
        metadata: {
          status_code: response.status,
          content_type: response.headers.get('content-type') || '',
          content_length: result.originalLength,
          title: this.extractTitle(body),
          truncated: result.truncated,
          url: response.url,
          cached: false,
        },
      });

      this.cache.set(key, toolResult);
      return toolResult;
    } catch (err) {
      if (err instanceof WebToolError) return errorResult(err);
      return errorResult(new WebToolError('TIMEOUT', (err as Error).message));
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': this.config.userAgent },
        redirect: 'follow',
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new WebToolError('TIMEOUT', `Request timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private processContent(body: string, mode: string, maxLength?: number, selector?: string): string {
    switch (mode) {
      case 'selective':
        return selector ? this.htmlExtractor.extractBySelector(body, selector) : this.htmlExtractor.toText(body);
      case 'truncated':
        return this.htmlExtractor.toText(body).slice(0, maxLength || 50000);
      default:
        return this.htmlExtractor.toText(body);
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }
}
