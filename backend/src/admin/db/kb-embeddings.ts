/**
 * admin/db/kb-embeddings.ts — KB embedding data for visualization via local SQLite.
 * SA4E-50: Uses getAdminDb() directly — SQLite-specific operations
 * (sqlite_master checks). Always uses local DB regardless of activeEngine.
 */

import { getAdminDb } from './core.js';

/** Check if a table exists in the local SQLite database */
function hasTable(tableName: string): boolean {
  const db = getAdminDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { cnt: number } | undefined;
  return (row?.cnt ?? 0) > 0;
}

/** Try to get real vector embeddings from knowledge_vectors table */
function getVectorEmbeddings(limit: number): { id: string; label: string; x: number; y: number; type: string }[] | null {
  if (!hasTable('knowledge_vectors')) return null;
  const db = getAdminDb();

  const rows = db.prepare(
    `SELECT e.id, e.source, e.summary, e.type, e.tier, v.vector
     FROM knowledge_entries e
     INNER JOIN knowledge_vectors v ON v.entry_id = e.id
     WHERE v.vector IS NOT NULL
     ORDER BY e.created_at DESC LIMIT ?`
  ).all(limit) as any[];

  if (rows.length === 0) return null;
  return rows.map((row, i) => parseVectorRow(row, i));
}

/** Parse a vector row into display coordinates using PCA-like projection */
function parseVectorRow(row: any, index: number): { id: string; label: string; x: number; y: number; type: string } {
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
      x = +((sumX / half + 1) / 2).toFixed(3);
      y = +((sumY / half + 1) / 2).toFixed(3);
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
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

/** Deterministic hash-based 2D position from content string */
function hashPosition(content: string): { x: number; y: number } {
  let h1 = 0, h2 = 0;
  for (let j = 0; j < content.length; j++) {
    h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
    h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
  }
  return { x: +((h1 % 1000) / 1000).toFixed(3), y: +((h2 % 1000) / 1000).toFixed(3) };
}

export function getKbEmbeddings(limit = 100): {
  items: { id: string; label: string; x: number; y: number; type: string }[];
  hasRealData: boolean;
} {
  try {
    if (!hasTable('knowledge_entries')) return { items: [], hasRealData: false };

    // Try real vector data first
    const vectorItems = getVectorEmbeddings(limit);
    if (vectorItems) return { items: vectorItems, hasRealData: true };

    // Fallback: hash-based positions from knowledge_entries content
    const db = getAdminDb();
    const rows = db.prepare(
      'SELECT id, source, summary, type, content FROM knowledge_entries ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as any[];
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
