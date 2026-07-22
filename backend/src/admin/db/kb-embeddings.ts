/**
 * admin/db/kb-embeddings.ts — KB embedding data for visualization.
 * SA4E-50: Uses getIndexAdapter() async methods for PostgreSQL/SQLite support.
 * Vector parsing (Float32Array) is engine-agnostic; runs on the returned blobs.
 */

import { getIndexAdapter, getActiveEngine } from './core.js';
import type { DatabaseEngine } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';

/** Check if a table exists using cross-engine DialectHelper query. */
async function hasTable(tableName: string): Promise<boolean> {
  const adapter = getIndexAdapter();
  const dialect = new DialectHelper(getActiveEngine() as DatabaseEngine);
  const row = await adapter.getAsync<Record<string, string>>(
    dialect.tableExistsQuery(tableName),
  );
  return !!row;
}

/** Deterministic hash-based 2D position from content string. */
function hashPosition(content: string): { x: number; y: number } {
  let h1 = 0, h2 = 0;
  for (let j = 0; j < content.length; j++) {
    h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
    h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
  }
  return { x: +((h1 % 1000) / 1000).toFixed(3), y: +((h2 % 1000) / 1000).toFixed(3) };
}

/** Parse a vector row into 2D display coordinates using PCA-like projection. */
function parseVectorRow(
  row: any,
  index: number,
): { id: string; label: string; x: number; y: number; type: string } {
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
      for (let j = 0; j < half; j++) { sumX += embedding[j]; sumY += embedding[j + half]; }
      x = Math.max(0, Math.min(1, +((sumX / half + 1) / 2).toFixed(3)));
      y = Math.max(0, Math.min(1, +((sumY / half + 1) / 2).toFixed(3)));
    }
  } catch {
    // Fallback: hash-based positioning when vector parsing fails
    ({ x, y } = hashPosition(row.source || row.summary || ''));
  }
  return {
    id: String(row.id),
    label: row.source || row.summary || `Entry ${index + 1}`,
    x, y,
    type: row.type || 'document',
  };
}

/** Try to get real vector embeddings from knowledge_vectors table. */
async function getVectorEmbeddings(
  limit: number,
): Promise<{ id: string; label: string; x: number; y: number; type: string }[] | null> {
  if (!(await hasTable('knowledge_vectors'))) return null;
  const adapter = getIndexAdapter();

  const rows = await adapter.allAsync<any>(
    `SELECT e.id, e.source, e.summary, e.type, e.tier, v.vector
     FROM knowledge_entries e
     INNER JOIN knowledge_vectors v ON v.entry_id = e.id
     WHERE v.vector IS NOT NULL
     ORDER BY e.created_at DESC LIMIT ?`,
    [limit],
  );

  if (rows.length === 0) return null;
  return rows.map((row, i) => parseVectorRow(row, i));
}

/**
 * Retrieve 2D embedding coordinates for KB visualization.
 * Uses real vector data when available; falls back to hash-based positions.
 * @param limit - Max entries to return
 */
export async function getKbEmbeddings(
  limit = 100,
): Promise<{
  items: { id: string; label: string; x: number; y: number; type: string }[];
  hasRealData: boolean;
}> {
  try {
    if (!(await hasTable('knowledge_entries'))) return { items: [], hasRealData: false };

    const vectorItems = await getVectorEmbeddings(limit);
    if (vectorItems) return { items: vectorItems, hasRealData: true };

    // Fallback: hash-based positions from knowledge_entries content
    const adapter = getIndexAdapter();
    const rows = await adapter.allAsync<any>(
      'SELECT id, source, summary, type, content FROM knowledge_entries ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    if (rows.length === 0) return { items: [], hasRealData: false };

    const items = rows.map((row, i) => {
      const { x, y } = hashPosition(row.content || row.source || row.summary || '');
      return {
        id: String(row.id),
        label: row.source || row.summary || `Entry ${i + 1}`,
        x, y,
        type: row.type || 'document',
      };
    });
    return { items, hasRealData: true };
  } catch {
    return { items: [], hasRealData: false };
  }
}
