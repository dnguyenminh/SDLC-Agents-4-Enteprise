import { z } from 'zod';
import { IServerManager } from '../types/server-types.js';
import { McpBridge } from '../langgraph/core/mcp-bridge.js';
import { debugError, debugLog } from '../debug-logger.js';

export const KbSearchResultItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  score: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type KbSearchResultItem = z.infer<typeof KbSearchResultItemSchema>;

export interface KbSearchOptions {
  limit?: number;
  scope?: string;
  type?: string;
}

/**
 * PiWorkflow KB Client — Option C spec
 * Provides typed access to Backend Knowledge Base via MCP tools (mem_search / mem_ingest).
 */
export class KbClient {
  private readonly mcpBridge: McpBridge;

  constructor(serverManager: IServerManager) {
    this.mcpBridge = new McpBridge(serverManager);
  }

  /**
   * Search knowledge base entries using MCP mem_search tool.
   * Clamps limit between 1 and 100.
   */
  async search(query: string, options: KbSearchOptions = {}): Promise<KbSearchResultItem[]> {
    if (!query || query.trim() === '') return [];
    const clampedLimit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    try {
      const payload: Record<string, unknown> = {
        query: query.trim(),
        limit: clampedLimit,
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.type ? { type: options.type } : {}),
      };
      const raw = await this.mcpBridge.callTool('mem_search', payload);
      if (!raw) return [];

      let rawItems: unknown[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          rawItems = parsed;
        } else if (parsed && Array.isArray(parsed.results)) {
          rawItems = parsed.results;
        } else if (parsed && Array.isArray(parsed.entries)) {
          rawItems = parsed.entries;
        } else if (parsed && typeof parsed === 'object') {
          rawItems = [parsed];
        }
      } catch {
        rawItems = [{ content: raw }];
      }

      const validated: KbSearchResultItem[] = [];
      for (const item of rawItems) {
        const result = KbSearchResultItemSchema.safeParse(item);
        if (result.success) {
          validated.push(result.data);
        } else {
          debugError(`[KbClient] Invalid search result item dropped: ${result.error.message}`);
        }
      }
      return validated;
    } catch (err) {
      debugError(`[KbClient] mem_search failed for "${query}"`, err as Error);
      return [];
    }
  }

  /**
   * Ingest text knowledge into the local KB using MCP mem_ingest tool.
   */
  async ingest(content: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
    if (!content || content.trim() === '') return false;
    try {
      await this.mcpBridge.callTool('mem_ingest', {
        content: content.trim(),
        ...metadata,
      });
      debugLog('[KbClient] Ingested knowledge successfully');
      return true;
    } catch (err) {
      debugError('[KbClient] mem_ingest failed', err as Error);
      return false;
    }
  }
}
