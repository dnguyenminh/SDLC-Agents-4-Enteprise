/**
 * admin/db/kb-entries.ts — Knowledge base entry queries via DatabaseAdapter.
 * SA4E-50: Uses getIndexAdapter() async methods for PostgreSQL/SQLite support.
 * sqlite_master checks are SQLite-only and guarded by engine detection.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists (SQLite only). */
async function tableExists(): Promise<boolean> {
  if (getActiveEngine() !== 'sqlite') return true; // PG: always exists if schema was run
  const adapter = getIndexAdapter();
  const row = await adapter.getAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'",
  );
  return (row?.cnt ?? 0) > 0;
}

/**
 * Fetch a single KB entry by its ID.
 * @returns Raw entry row or null
 */
export async function getKbEntryById(entryId: string): Promise<any | null> {
  try {
    if (!(await tableExists())) return null;
    const adapter = getIndexAdapter();
    const row = await adapter.getAsync<any>('SELECT * FROM knowledge_entries WHERE id = ?', [entryId]);
    return row || null;
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntryById');
    return null;
  }
}

/**
 * Count KB entries, respecting scope isolation.
 * Falls back to project_id match or total when scoped count is 0.
 * @param projectId - Optional project scope
 * @param userId - Optional user scope
 */
export async function getKbEntryCount(
  projectId?: string,
  userId?: string,
): Promise<number> {
  try {
    if (!(await tableExists())) return 0;
    const adapter = getIndexAdapter();
    const filter = buildAdminScopeFilter(projectId, userId);

    if (filter) {
      const row = await adapter.getAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE ${filter.clause}`,
        filter.params as unknown[],
      );
      const scopedCount = row?.cnt ?? 0;
      // SA4E-49: Fall back to project_id match when scoped count is 0
      if (scopedCount === 0) return getUnfilteredKbEntryCount(projectId);
      return scopedCount;
    }

    const row = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries',
    );
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
async function getUnfilteredKbEntryCount(projectId?: string): Promise<number> {
  const adapter = getIndexAdapter();
  if (projectId) {
    const row = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE project_id = ? OR project_id IS NULL',
      [projectId],
    );
    if ((row?.cnt ?? 0) > 0) return row!.cnt;
  }
  const row = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM knowledge_entries',
  );
  return row?.cnt ?? 0;
}

/**
 * List KB entries with pagination and sorting.
 * @returns Paginated items array and total count
 */
export async function getKbEntries(
  page = 1,
  pageSize = 20,
  sortBy = 'created_at',
  sortDir: 'asc' | 'desc' = 'desc',
  projectId?: string,
  userId?: string,
): Promise<{ items: any[]; total: number }> {
  try {
    if (!(await tableExists())) return { items: [], total: 0 };
    const adapter = getIndexAdapter();

    // Validate sort column to prevent SQL injection
    const validColumns = ['id', 'created_at', 'updated_at', 'source', 'type',
      'tier', 'quality_score', 'tags', 'summary', 'content'];
    const safeSort = validColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const filter = buildAdminScopeFilter(projectId, userId);
    return filter
      ? fetchWithFilter(adapter, filter, safeSort, safeDir, page, pageSize)
      : fetchWithoutFilter(adapter, safeSort, safeDir, page, pageSize);
  } catch (err) {
    logger.error({ err }, 'Error in getKbEntries');
    return { items: [], total: 0 };
  }
}

/** Fetch with scope isolation WHERE clause. */
async function fetchWithFilter(
  adapter: DatabaseAdapter,
  filter: { clause: string; params: unknown[] },
  safeSort: string,
  safeDir: string,
  page: number,
  pageSize: number,
): Promise<{ items: any[]; total: number }> {
  const where = `WHERE ${filter.clause}`;
  const countRow = await adapter.getAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM knowledge_entries ${where}`,
    filter.params as unknown[],
  );
  const total = countRow?.cnt ?? 0;
  const rows = await adapter.allAsync<Record<string, unknown>>(
    `SELECT * FROM knowledge_entries ${where} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
    [...(filter.params as unknown[]), pageSize, (page - 1) * pageSize],
  );
  return { items: rows, total };
}

/** Fetch without scope filter (unscoped admin view). */
async function fetchWithoutFilter(
  adapter: DatabaseAdapter,
  safeSort: string,
  safeDir: string,
  page: number,
  pageSize: number,
): Promise<{ items: any[]; total: number }> {
  const countRow = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM knowledge_entries',
  );
  const total = countRow?.cnt ?? 0;
  const rows = await adapter.allAsync<Record<string, unknown>>(
    `SELECT * FROM knowledge_entries ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
  );
  return { items: rows, total };
}


