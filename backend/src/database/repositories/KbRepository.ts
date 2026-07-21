/**
 * SA4E-50 — KbRepository: encapsulates knowledge_entries table queries.
 * Provides entry count and paginated retrieval with scope filtering.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IKbRepository } from './interfaces.js';
import type { PaginatedResult } from './types.js';
import { translateError } from '../errors/index.js';
import { buildAdminScopeFilter } from '../../admin/db/kb-scope-filter.js';

/** Allowed sort columns — prevents SQL injection via column name. */
const VALID_SORT_COLUMNS = [
  'id', 'created_at', 'updated_at', 'source', 'type',
  'tier', 'quality_score', 'tags', 'summary', 'content',
] as const;

/**
 * Repository for knowledge base entry queries.
 * Delegates scope filtering to buildAdminScopeFilter (DRY reuse).
 */
export class KbRepository implements IKbRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Get total knowledge entry count with scope filtering.
   * @param projectId - Project scope for isolation
   * @param userId - Optional user scope
   * @returns Entry count (0 if table missing)
   * @throws RepositoryError on database failure
   */
  getEntryCount(projectId: string, userId?: string): number {
    try {
      const filter = buildAdminScopeFilter(projectId, userId);
      if (filter) {
        const row = this.adapter.get<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE ${filter.clause}`,
          filter.params as unknown[],
        );
        const count = row?.cnt ?? 0;
        if (count > 0) return count;
        return this.unfilteredCount(projectId);
      }
      const row = this.adapter.get<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM knowledge_entries',
      );
      return row?.cnt ?? 0;
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Get paginated knowledge entries with sorting.
   * @param page - Page number (1-based)
   * @param pageSize - Items per page
   * @param sortBy - Column to sort by (validated against allowlist)
   * @param sortOrder - 'asc' or 'desc'
   * @param projectId - Project scope for isolation
   * @param userId - Optional user scope
   * @returns Paginated result with items and total count
   * @throws RepositoryError on database failure
   */
  getEntries(
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string,
    projectId: string,
    userId?: string,
  ): PaginatedResult {
    try {
      const safeSort = this.validateSortColumn(sortBy);
      const safeDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const offset = (page - 1) * pageSize;
      const filter = buildAdminScopeFilter(projectId, userId);

      if (filter) {
        return this.queryWithFilter(filter, safeSort, safeDir, pageSize, offset);
      }
      return this.queryAll(safeSort, safeDir, pageSize, offset);
    } catch (err) {
      throw translateError(err);
    }
  }

  /** Fallback count when scope filter returns 0. */
  private unfilteredCount(projectId: string): number {
    const row = this.adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE project_id = ? OR project_id IS NULL',
      [projectId],
    );
    const count = row?.cnt ?? 0;
    if (count > 0) return count;
    const total = this.adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries',
    );
    return total?.cnt ?? 0;
  }

  /** Query with scope filter applied. */
  private queryWithFilter(
    filter: { clause: string; params: unknown[] },
    sort: string, dir: string, limit: number, offset: number,
  ): PaginatedResult {
    const where = `WHERE ${filter.clause}`;
    const countRow = this.adapter.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM knowledge_entries ${where}`,
      filter.params as unknown[],
    );
    const total = countRow?.cnt ?? 0;
    const items = this.adapter.all<Record<string, unknown>>(
      `SELECT * FROM knowledge_entries ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
      [...(filter.params as unknown[]), limit, offset],
    );
    return { items, total };
  }

  /** Query all entries without scope filter. */
  private queryAll(
    sort: string, dir: string, limit: number, offset: number,
  ): PaginatedResult {
    const countRow = this.adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries',
    );
    const total = countRow?.cnt ?? 0;
    const items = this.adapter.all<Record<string, unknown>>(
      `SELECT * FROM knowledge_entries ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return { items, total };
  }

  /** Validate sort column against allowlist to prevent SQL injection. */
  private validateSortColumn(col: string): string {
    return (VALID_SORT_COLUMNS as readonly string[]).includes(col) ? col : 'created_at';
  }
}
