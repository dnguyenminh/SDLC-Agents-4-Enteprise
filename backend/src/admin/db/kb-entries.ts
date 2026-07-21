/**
 * admin/db/kb-entries.ts — Knowledge base entry queries via local SQLite.
 * SA4E-50: Uses getAdminDb() directly — these are SQLite-specific operations
 * (FTS5, sqlite_master checks). Always uses local DB regardless of activeEngine.
 */

import { getAdminDb, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists in the local SQLite database */
function tableExists(): boolean {
  const db = getAdminDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'"
  ).get() as { cnt: number } | undefined;
  return (row?.cnt ?? 0) > 0;
}

export function getKbEntryById(entryId: string): any | null {
  try {
    if (!tableExists()) return null;
    const db = getAdminDb();
    const row = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId);
    return row || null;
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntryById');
    return null;
  }
}

export function getKbEntryCount(projectId?: string, userId?: string): number {
  try {
    if (!tableExists()) return 0;
    const db = getAdminDb();
    const filter = buildAdminScopeFilter(projectId, userId);
    if (filter) {
      const row = db.prepare(
        `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE ${filter.clause}`
      ).get(...(filter.params as unknown[])) as { cnt: number } | undefined;
      const scopedCount = row?.cnt ?? 0;
      // SA4E-49: If scoped count is 0, fall back to project_id match or total count.
      if (scopedCount === 0) {
        return getUnfilteredKbEntryCount(projectId);
      }
      return scopedCount;
    }
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries'
    ).get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntryCount');
    return 0;
  }
}

/**
 * SA4E-49: Fallback count when scope-based filter returns 0.
 * Tries project_id match first, then total count as last resort.
 * Admin views need accurate counts even if scope metadata is incomplete.
 */
function getUnfilteredKbEntryCount(projectId?: string): number {
  const db = getAdminDb();
  // Try counting by project_id direct match (includes NULL project_id for legacy entries)
  if (projectId) {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE project_id = ? OR project_id IS NULL'
    ).get(projectId) as { cnt: number } | undefined;
    const count = row?.cnt ?? 0;
    if (count > 0) return count;
  }
  // Last resort: total unfiltered count
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM knowledge_entries'
  ).get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
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
    if (!tableExists()) return { items: [], total: 0 };
    const db = getAdminDb();

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
      const countRow = db.prepare(
        `SELECT COUNT(*) as cnt FROM knowledge_entries ${whereClause}`
      ).get(...(filter.params as unknown[])) as { cnt: number } | undefined;
      total = countRow?.cnt ?? 0;
      rows = db.prepare(
        `SELECT * FROM knowledge_entries ${whereClause} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`
      ).all(...(filter.params as unknown[]), pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    } else {
      const countRow = db.prepare(
        'SELECT COUNT(*) as cnt FROM knowledge_entries'
      ).get() as { cnt: number } | undefined;
      total = countRow?.cnt ?? 0;
      rows = db.prepare(
        `SELECT * FROM knowledge_entries ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`
      ).all(pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    }

    return { items: rows, total };
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntries');
    return { items: [], total: 0 };
  }
}
