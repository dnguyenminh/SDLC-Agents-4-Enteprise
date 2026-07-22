/**
 * Analytics Module — real tool usage stats and KB quality scoring.
 * Reads from mcp_tools (call counts), knowledge_entries (KB stats),
 * and audit_log (recent activity) via admin DB adapter.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import { getAdminAdapter } from '../../admin/db/core.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { withErrorHandling, withTextResult, compose } from '../../tool-router/ToolHandlerDecorators.js';

/** Summary row returned by analytics_summary tool. */
interface AnalyticsSummary {
  totalCalls: number;
  uniqueTools: number;
  topTools: Array<{ name: string; calls: number }>;
  kbEntries: number;
  kbScopeCounts: Record<string, number>;
  recentErrors: number;
}

/** Quality row returned by quality_score tool. */
interface QualityScore {
  entry_id: string;
  score: number;
  factors: {
    hasContent: boolean;
    contentLength: number;
    tagCount: number;
    hasSummary: boolean;
    ageScore: number;
  };
}

export class AnalyticsModule implements IModule {
  readonly name = 'analytics';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private adapter!: DatabaseAdapter;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing analytics module');
    try {
      this.adapter = getAdminAdapter();
      this._status = 'ready';
      this.logger.info('Analytics module ready');
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize analytics module');
      this._status = 'error';
    }
  }

  async shutdown(): Promise<void> { this._status = 'stopped'; }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('analytics_summary', async (args) => {
      try {
        const topN = typeof args.top_n === 'number' ? args.top_n : 10;
        const summary = await this.buildSummary(topN);
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }], isError: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error({ err }, 'analytics_summary failed');
        return { content: [{ type: 'text', text: `Analytics unavailable: ${msg}` }], isError: true };
      }
    });

    handlers.set('quality_score', async (args) => {
      try {
        const entryId = String(args.entry_id || '');
        if (!entryId) {
          return { content: [{ type: 'text', text: 'Missing required argument: entry_id' }], isError: true };
        }
        const result = await this.computeQualityScore(entryId);
        if (!result) {
          return { content: [{ type: 'text', text: `Entry not found: ${entryId}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error({ err, entry_id: args.entry_id }, 'quality_score failed');
        return { content: [{ type: 'text', text: `Quality score unavailable: ${msg}` }], isError: true };
      }
    });

    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'analytics_summary',
        description: 'Get real analytics: total tool calls, top tools by usage, KB entry counts by scope, and recent error count.',
        inputSchema: {
          type: 'object',
          properties: { top_n: { type: 'number', description: 'Number of top tools to return (default 10)' } },
        },
        category: 'analytics',
      },
      {
        name: 'quality_score',
        description: 'Compute quality score (0–100) for a KB entry based on content length, tag count, summary presence, and recency.',
        inputSchema: {
          type: 'object',
          properties: { entry_id: { type: 'string', description: 'UUID of the knowledge entry' } },
          required: ['entry_id'],
        },
        category: 'analytics',
      },
    ];
  }

  // --- Private helpers ---

  /** Aggregate real usage data from mcp_tools and knowledge_entries tables. */
  private async buildSummary(topN: number): Promise<AnalyticsSummary> {
    const totalRow = await this.adapter.getAsync<{ total: number }>(
      'SELECT COALESCE(SUM(call_count), 0) as total FROM mcp_tools', [],
    );
    const totalCalls = totalRow?.total ?? 0;

    const uniqueRow = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM mcp_tools WHERE call_count > 0', [],
    );
    const uniqueTools = uniqueRow?.cnt ?? 0;

    const topRows = await this.adapter.allAsync<{ name: string; call_count: number }>(
      'SELECT name, call_count FROM mcp_tools ORDER BY call_count DESC LIMIT ?', [topN],
    );
    const topTools = topRows.map(r => ({ name: r.name, calls: r.call_count }));

    const kbRow = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries', [],
    );
    const kbEntries = kbRow?.cnt ?? 0;

    const scopeRows = await this.adapter.allAsync<{ scope: string; cnt: number }>(
      "SELECT COALESCE(scope, 'global') as scope, COUNT(*) as cnt FROM knowledge_entries GROUP BY scope", [],
    );
    const kbScopeCounts: Record<string, number> = {};
    for (const row of scopeRows) kbScopeCounts[row.scope] = row.cnt;

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const errRow = await this.adapter.getAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE action LIKE '%error%' AND timestamp > ?", [since],
    );
    const recentErrors = errRow?.cnt ?? 0;

    return { totalCalls, uniqueTools, topTools, kbEntries, kbScopeCounts, recentErrors };
  }

  /** Compute a 0–100 quality score for a single KB entry. */
  private async computeQualityScore(entryId: string): Promise<QualityScore | null> {
    const row = await this.adapter.getAsync<{
      id: string; content: string; summary: string | null;
      tags: string | null; created_at: string | null;
    }>(
      'SELECT id, content, summary, tags, created_at FROM knowledge_entries WHERE id = ?',
      [entryId],
    );
    if (!row) return null;

    const contentLength = (row.content || '').length;
    const hasContent = contentLength > 50;
    const tagCount = row.tags ? row.tags.split(',').filter(Boolean).length : 0;
    const hasSummary = Boolean(row.summary && row.summary.length > 10);

    // Age score: full score within 30 days, decays to 0 at 365 days
    const ageMs = row.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;
    const ageScore = Math.max(0, 1 - ageMs / (365 * 86_400_000));

    const score = Math.round(
      (hasContent ? 40 : 0) +
      Math.min(20, contentLength / 200) +
      Math.min(20, tagCount * 5) +
      (hasSummary ? 10 : 0) +
      ageScore * 10,
    );

    return {
      entry_id: entryId,
      score: Math.min(100, score),
      factors: {
        hasContent, contentLength, tagCount, hasSummary,
        ageScore: Math.round(ageScore * 100) / 100,
      },
    };
  }
}
