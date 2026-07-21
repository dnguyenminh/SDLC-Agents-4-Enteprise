/**
 * admin/db/kb-search.ts — KB full-text search via DatabaseAdapter.
 * SA4E-45: Uses getIndexAdapter() for multi-DB support.
 */

import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists */
function tableExists(): boolean {
  const adapter = getIndexAdapter();
  if (getActiveEngine() === 'sqlite') {
    const row = adapter.get<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'"
    );
    return (row?.cnt ?? 0) > 0;
  }
  return true;
}

export function searchKbEntries(
  query: string, projectId?: string, userId?: string
): { items: any[]; total: number } {
  try {
    if (!tableExists()) return { items: [], total: 0 };
    const adapter = getIndexAdapter();

    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (queryTerms.length === 0) return { items: [], total: 0 };

    const totalRow = adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries'
    );
    const totalDocs = totalRow?.cnt ?? 0;

    const searchCols = ['content', 'source', 'summary', 'tags'];
    const likeClauses: string[] = [];
    const likeParams: unknown[] = [];
    for (const term of queryTerms) {
      for (const col of searchCols) {
        likeClauses.push(`${col} LIKE ?`);
        likeParams.push(`%${term}%`);
      }
    }
    const filter = buildAdminScopeFilter(projectId, userId);
    const projectFilter = filter ? ` AND (${filter.clause})` : '';
    const projectParams = filter ? (filter.params as unknown[]) : [];
    const sql = `SELECT * FROM knowledge_entries WHERE (${likeClauses.join(' OR ')})${projectFilter} LIMIT 200`;
    const rows = adapter.all<Record<string, unknown>>(sql, [...likeParams, ...projectParams]);

    // TF-IDF scoring
    const termDocFreq: Record<string, number> = {};
    for (const term of queryTerms) {
      let docCount = 0;
      for (const row of rows) {
        const text = `${row.content || ''} ${row.source || ''} ${row.summary || ''} ${row.tags || ''}`.toLowerCase();
        if (text.includes(term)) docCount++;
      }
      termDocFreq[term] = docCount;
    }

    const now = Date.now();
    const scoredRows = rows.map((row: any) => {
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
        const regex = new RegExp(escaped, 'gi');
        const occurrences = (fullText.match(regex) || []).length;
        const tf = occurrences / totalWords;
        const df = termDocFreq[term] || 1;
        const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
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

      let recencyBonus = 0;
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      if (ageDays <= 7) recencyBonus = 0.2;
      else if (ageDays <= 30) recencyBonus = 0.1;

      const qualityRaw = row.quality_score != null ? row.quality_score / 100 : (row.confidence || 0);
      const qualityBonus = qualityRaw * 0.1;

      const totalScore = normalizedTfidf + keywordBonus + recencyBonus + qualityBonus;
      const finalScore = Math.min(+totalScore.toFixed(3), 1.0);

      return {
        ...row,
        score: finalScore,
        scores: {
          similarity: +normalizedTfidf.toFixed(3),
          keyword: +keywordBonus.toFixed(3),
          recency: +recencyBonus.toFixed(3),
          quality: +qualityBonus.toFixed(3),
        },
      };
    });

    scoredRows.sort((a: any, b: any) => b.score - a.score);
    return { items: scoredRows.slice(0, 50), total: scoredRows.length };
  } catch (err) {
    logger.error({ err }, 'Error in searchKbEntries');
    return { items: [], total: 0 };
  }
}
