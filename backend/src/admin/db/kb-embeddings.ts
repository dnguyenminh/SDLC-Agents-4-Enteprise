/**
 * admin/db/kb-embeddings.ts — KB embedding data for visualization via DatabaseAdapter.
 * SA4E-45: Uses getIndexAdapter() for multi-DB support.
 */

import { getIndexAdapter, getActiveEngine } from './core.js';

/** Check if a table exists in the index database */
function hasTable(adapter: ReturnType<typeof getIndexAdapter>, tableName: string): boolean {
  if (getActiveEngine() === 'sqlite') {
    const row = adapter.get<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return (row?.cnt ?? 0) > 0;
  }
  // PG/MySQL: assume table exists (managed by migrations)
  return true;
}

export function getKbEmbeddings(limit = 100): {
  items: { id: string; label: string; x: number; y: number; type: string }[];
  hasRealData: boolean;
} {
  try {
    const adapter = getIndexAdapter();
    if (!hasTable(adapter, 'knowledge_entries')) {
      return { items: [], hasRealData: false };
    }

    // Try real vector data first
    if (hasTable(adapter, 'knowledge_vectors')) {
      const rows = adapter.all<Record<string, unknown>>(
        `SELECT e.id, e.source, e.summary, e.type, e.tier, v.vector
         FROM knowledge_entries e
         INNER JOIN knowledge_vectors v ON v.entry_id = e.id
         WHERE v.vector IS NOT NULL
         ORDER BY e.created_at DESC
         LIMIT ?`,
        [limit]
      );

      if (rows.length > 0) {
        const items = rows.map((row: any, i: number) => {
          let x = 0, y = 0;
          try {
            let embedding: number[] = [];
            if (typeof row.vector === 'string') {
              embedding = JSON.parse(row.vector);
            } else if (Buffer.isBuffer(row.vector)) {
              const buf = row.vector as Buffer;
              const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
              embedding = Array.from(floats);
            }
            if (embedding.length >= 2) {
              const half = Math.floor(embedding.length / 2);
              let sumX = 0, sumY = 0;
              for (let j = 0; j < half; j++) {
                sumX += embedding[j];
                sumY += embedding[j + half];
              }
              x = sumX / half;
              y = sumY / half;
              x = +((x + 1) / 2).toFixed(3);
              y = +((y + 1) / 2).toFixed(3);
              x = Math.max(0, Math.min(1, x));
              y = Math.max(0, Math.min(1, y));
            }
          } catch {
            // Fallback: hash-based positioning
            const content = (row.source || row.summary || '') as string;
            let h1 = 0, h2 = 0;
            for (let j = 0; j < content.length; j++) {
              h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
              h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
            }
            x = +((h1 % 1000) / 1000).toFixed(3);
            y = +((h2 % 1000) / 1000).toFixed(3);
          }
          return {
            id: String(row.id),
            label: row.source || row.summary || `Entry ${i + 1}`,
            x, y,
            type: row.type || 'document',
          };
        });
        return { items, hasRealData: true };
      }
    }

    // Fallback: hash-based positions from knowledge_entries content
    const rows = adapter.all<Record<string, unknown>>(
      'SELECT id, source, summary, type, content FROM knowledge_entries ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    if (rows.length === 0) return { items: [], hasRealData: false };

    const items = rows.map((row: any, i: number) => {
      const content = row.content || row.source || row.summary || '';
      let h1 = 0, h2 = 0;
      for (let j = 0; j < content.length; j++) {
        h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
        h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
      }
      return {
        id: String(row.id),
        label: row.source || row.summary || `Entry ${i + 1}`,
        x: +((h1 % 1000) / 1000).toFixed(3),
        y: +((h2 % 1000) / 1000).toFixed(3),
        type: row.type || 'document',
      };
    });
    return { items, hasRealData: true };
  } catch {
    return { items: [], hasRealData: false };
  }
}
