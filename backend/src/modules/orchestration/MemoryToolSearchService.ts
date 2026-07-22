/**
 * MemoryToolSearchService — implements ToolSearchService using mcp_tools table.
 * SA4E-53: converted to use DatabaseAdapter (async) for PostgreSQL compatibility.
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
      const rows = await this.adapter.allAsync<McpToolRow>(
        'SELECT name, description, schema_json, vector FROM mcp_tools',
      );

      const scored = rows.map(r => {
        let score = 0;
        if (r.vector) {
          const floatArray = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4);
          score = EmbeddingService.getInstance().cosineSimilarity(queryVector, Array.from(floatArray));
        }
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
