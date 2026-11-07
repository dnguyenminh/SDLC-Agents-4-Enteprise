/**
 * MemoryToolSearchService — implements ToolSearchService using mcp_tools table.
 * SA4E-53: converted to use DatabaseAdapter (async) for PostgreSQL compatibility.
 * SA4E-369 follow-up: `labels` (derived keyword surface persisted by
 * tool-ingestion) add a deterministic score boost on top of cosine similarity —
 * exact keyword hits ("jira", "drawio") no longer drown behind vector noise,
 * and rows without an embedding can still be recalled by keyword.
 */

import type { ToolSearchService, ToolSearchResult } from './ToolSearchService.js';
import { EmbeddingService } from '../../engine/parsers/embedding/EmbeddingService.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';

interface McpToolRow {
  name: string;
  description: string;
  schema_json: string;
  vector: Buffer | null;
  labels?: string | null;
}

export class MemoryToolSearchService implements ToolSearchService {
  constructor(
    /** SA4E-53: DatabaseAdapter for cross-engine async queries. */
    private readonly adapter: DatabaseAdapter,
    private readonly logger: Logger,
  ) {}

  async search(query: string, topK: number): Promise<ToolSearchResult[]> {
    try {
      const queryVector = await EmbeddingService.getInstance().generateEmbedding(query);
      // Tokenizer parity with tool-labels.tokensOf: underscores split
      // (`mem_ingest` → mem, ingest) so an underscored query still matches the
      // underscore-free label tokens (SA4E-369 follow-up).
      const qTokens = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
      const rows = await this.adapter.allAsync<McpToolRow>(
        'SELECT name, description, schema_json, vector, labels FROM mcp_tools',
      );

      const scored = rows.map(r => {
        let score = 0;
        if (r.vector) {
          const floatArray = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4);
          score = EmbeddingService.getInstance().cosineSimilarity(queryVector, Array.from(floatArray));
        }
        score += labelBoost(qTokens, r.labels ?? '');
        return {
          name: r.name,
          description: r.description,
          schema: JSON.parse(r.schema_json) as Record<string, unknown>,
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    } catch (err) {
      this.logger.error({ err, query }, 'MemoryToolSearchService: vector search failed');
      return [];
    }
  }
}

/** Keyword-hit boost: each exact label token matched by a query token adds 0.15,
 *  capped at 0.35 — enough to outrank weak cosine noise, never a hard override. */
function labelBoost(qTokens: Set<string>, labels: string): number {
  if (!labels) return 0;
  let hits = 0;
  for (const part of labels.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (part && qTokens.has(part)) hits++;
  }
  if (hits === 0) return 0;
  return Math.min(0.35, 0.15 * hits);
}
