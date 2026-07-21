/**
 * admin/db/kb-entries.ts — Knowledge base entry queries via DatabaseAdapter.
 * SA4E-45: Uses getIndexAdapter() instead of direct SQLite for multi-DB support.
 */

import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists in the active database */
function tableExists(adapter: ReturnType<typeof getIndexAdapter>): boolean {
  if (getActiveEngine() === 'sqlite') {
    const row = adapter.get<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'"
    );
    return (row?.cnt ?? 0) > 0;
  }
  // PG/MySQL: assume table exists (migrations create it)
  return true;
}

export function getKbEntryById(entryId: string): any | null {
  try {
    const adapter = getIndexAdapter();
    if (!tableExists(adapter)) return null;
    const row = adapter.get<Record<string, unknown>>(
      'SELECT * FROM knowledge_entries WHERE id = ?', [entryId]
    );
    return row || null;
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntryById');
    return null;
  }
}

export function getKbEntryCount(projectId?: string, userId?: string): number {
  try {
    const adapter = getIndexAdapter();
    if (!tableExists(adapter)) return 0;
    const filter = buildAdminScopeFilter(projectId, userId);
    if (filter) {
      const row = adapter.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE ${filter.clause}`,
        filter.params as unknown[]
      );
      return row?.cnt ?? 0;
    }
    const row = adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries'
    );
    return row?.cnt ?? 0;
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntryCount');
    return 0;
  }
}

export function getKbEntries(
  page = 1,
  pageSize = 20,
  sortBy = 'created_at',
  sortDir: 'asc' | 'desc' = 'desc',
  projectId?: string,
  userId?: string
): { items: any[]; total: number } {
  try {
    const adapter = getIndexAdapter();
    if (!tableExists(adapter)) return { items: [], total: 0 };

    // Validate sort column to prevent SQL injection
    const validColumns = [
      'id', 'created_at', 'updated_at', 'source', 'type',
      'tier', 'quality_score', 'tags', 'summary', 'content',
    ];
    const safeSort = validColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const filter = buildAdminScopeFilter(projectId, userId);
    let total: number;
    let rows: Record<string, unknown>[];

    if (filter) {
      const whereClause = `WHERE ${filter.clause}`;
      const countRow = adapter.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM knowledge_entries ${whereClause}`,
        filter.params as unknown[]
      );
      total = countRow?.cnt ?? 0;
      rows = adapter.all<Record<string, unknown>>(
        `SELECT * FROM knowledge_entries ${whereClause} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
        [...(filter.params as unknown[]), pageSize, (page - 1) * pageSize]
      );
    } else {
      const countRow = adapter.get<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM knowledge_entries'
      );
      total = countRow?.cnt ?? 0;
      rows = adapter.all<Record<string, unknown>>(
        `SELECT * FROM knowledge_entries ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
        [pageSize, (page - 1) * pageSize]
      );
    }

    return { items: rows, total };
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntries');
    return { items: [], total: 0 };
  }
}
