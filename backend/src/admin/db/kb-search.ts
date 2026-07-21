/**
 * admin/db/kb-search.ts — KB full-text search via DatabaseAdapter.
 * SA4E-50: Uses getIndexAdapter() async methods for PostgreSQL/SQLite support.
 * TF-IDF scoring runs in-memory after DB fetch; compatible with all engines.
 */

import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists (SQLite only guard). */
async function tableExists(): Promise<boolean> {
  const adapter = getIndexAdapter();
  if (!adapter.isConnected()) return false; // PG not yet connected — skip gracefully
  if (getActiveEngine() !== 'sqlite') return true;
  const row = await adapter.getAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'",
  );
  return (row?.cnt ?? 0) > 0;
}

/** Score fields by LIKE match for each search term. */
function buildLikeClauses(
  queryTerms: string[],
  searchCols: string[],
): { likeClauses: string[]; likeParams: unknown[] } {
  const likeClauses: string[] = [];
  const likeParams: unknown[] = [];
  for (const term of queryTerms) {
    for (const col of searchCols) {
      likeClauses.push(`${col} LIKE ?`);
      likeParams.push(`%${term}%`);
    }
  }
  return { likeClauses, likeParams };
}

/** Compute TF-IDF + bonus score for a single row. */
function scoreRow(
  row: any,
  queryTerms: string[],
  termDocFreq: Record<string, number>,
  totalDocs: number,
  now: number,
): any {
  const fields = {
    content: (row.content || '').toLowerCase(),
    source: (row.source || '').toLowerCase(),
    summary: (row.summary || '').toLowerCase(),
    tags: (row.tags || '').toLowerCase(),
  };
  const fullText = `${fields.content} ${fields.source} ${fields.summary} ${fields.tags}`;
  const totalWords = fullText.split(/\s+/).length || 1;

  let tfidfScore = 0;
  for (const term of queryTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = (fullText.match(new RegExp(escaped, 'gi')) || []).length;
    const tf = occurrences / totalWords;
    const idf = Math.log((totalDocs + 1) / ((termDocFreq[term] || 1) + 1)) + 1;
    tfidfScore += tf * idf;
  }
  const normalizedTfidf = Math.min(tfidfScore * 100, 1.0);

  let keywordBonus = 0;
  for (const term of queryTerms) {
    if (fields.source.includes(term)) keywordBonus += 0.15;
    if (fields.summary.includes(term)) keywordBonus += 0.1;
    if (fields.tags.includes(term)) keywordBonus += 0.05;
  }
  keywordBonus = Math.min(keywordBonus, 0.3);

  const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
  const recencyBonus = ageDays <= 7 ? 0.2 : ageDays <= 30 ? 0.1 : 0;

  const qualityRaw = row.quality_score != null ? row.quality_score / 100 : (row.confidence || 0);
  const qualityBonus = qualityRaw * 0.1;

  return {
    ...row,
    score: +Math.min(normalizedTfidf + keywordBonus + recencyBonus + qualityBonus, 1.0).toFixed(3),
    scores: {
      similarity: +normalizedTfidf.toFixed(3),
      keyword: +keywordBonus.toFixed(3),
      recency: +recencyBonus.toFixed(3),
      quality: +qualityBonus.toFixed(3),
    },
  };
}

/**
 * Full-text search KB entries using LIKE + in-memory TF-IDF scoring.
 * @returns Top 50 scored results and total candidate count
 */
export async function searchKbEntries(
  query: string,
  projectId?: string,
  userId?: string,
): Promise<{ items: any[]; total: number }> {
  try {
    if (!(await tableExists())) return { items: [], total: 0 };
    const adapter = getIndexAdapter();

    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (queryTerms.length === 0) return { items: [], total: 0 };

    const totalRow = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries',
    );
    const totalDocs = totalRow?.cnt ?? 0;

    const searchCols = ['content', 'source', 'summary', 'tags'];
    const { likeClauses, likeParams } = buildLikeClauses(queryTerms, searchCols);
    const filter = buildAdminScopeFilter(projectId, userId);
    const projectFilter = filter ? ` AND (${filter.clause})` : '';
    const projectParams = filter ? (filter.params as unknown[]) : [];

    const rows = await adapter.allAsync<Record<string, unknown>>(
      `SELECT * FROM knowledge_entries WHERE (${likeClauses.join(' OR ')})${projectFilter} LIMIT 200`,
      [...likeParams, ...projectParams],
    );

    // Compute document frequency per term for IDF calculation
    const termDocFreq: Record<string, number> = {};
    for (const term of queryTerms) {
      termDocFreq[term] = rows.filter(row => {
        const text = `${row.content || ''} ${row.source || ''} ${row.summary || ''} ${row.tags || ''}`.toLowerCase();
        return text.includes(term);
      }).length;
    }

    const now = Date.now();
    const scoredRows = rows.map(row => scoreRow(row, queryTerms, termDocFreq, totalDocs, now));
    scoredRows.sort((a: any, b: any) => b.score - a.score);
    return { items: scoredRows.slice(0, 50), total: scoredRows.length };
  } catch (err) {
    logger.error({ err }, 'Error in searchKbEntries');
    return { items: [], total: 0 };
  }
}
