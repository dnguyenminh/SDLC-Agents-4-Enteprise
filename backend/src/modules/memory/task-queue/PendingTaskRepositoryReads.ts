/**
 * PendingTaskRepository — read/query methods (SA4E-44, SA4E-157, SA4E-164).
 * Extracted from PendingTaskRepository.ts: stats, listings and lookups.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { PendingTask } from './models.js';
import { TaskStatus } from './models.js';
import { PendingTaskRepositoryWrites } from './PendingTaskRepositoryWrites.js';

/** Read queries: stats, active-task listings, lookups. */
export class PendingTaskRepositoryReads extends PendingTaskRepositoryWrites {
  constructor(db: DatabaseAdapter) { super(db); }

  /** Get first task with given status (for progress display). */
  async getFirstByStatus(status: string): Promise<PendingTask | null> {
    return (await this.db.getAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY started_at DESC LIMIT 1`,
      [status],
    )) ?? null;
  }

  async getStats(): Promise<{ pending: number; processing: number; completed: number; failed: number }> {
    const rows = await this.db.allAsync<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*) as cnt FROM pending_tasks GROUP BY status`,
    );
    return aggregateStatusCounts(rows, false);
  }

  /** Get task stats scoped to a specific project. SA4E-164: direct WHERE instead of JOIN. */
  async getStatsByProject(projectId: string): Promise<{ pending: number; processing: number; completed: number; failed: number }> {
    const rows = await this.db.allAsync<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*) as cnt
       FROM pending_tasks
       WHERE project_id = $1
       GROUP BY status`,
      [projectId],
    );
    return aggregateStatusCounts(rows, true);
  }

  /**
   * SA4E-157: Get earliest started_at among PROCESSING tasks.
   * Reflects when enrichment actually began processing (not when tasks were originally created).
   * Falls back to current time if only PENDING tasks exist (just retried).
   * @returns ISO timestamp string or null if no active tasks
   */
  async getEarliestActiveTimestamp(): Promise<string | null> {
    // First: check PROCESSING tasks (actually being worked on)
    const processing = await this.db.getAsync<{ started_at: string | null }>(
      `SELECT MIN(started_at) as started_at FROM pending_tasks WHERE status = ? AND started_at IS NOT NULL`,
      [TaskStatus.PROCESSING],
    );
    if (processing?.started_at) return processing.started_at;
    // Fallback: if only PENDING tasks exist (freshly retried), use now as start
    const hasPending = await this.db.getAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM pending_tasks WHERE status = ?`,
      [TaskStatus.PENDING],
    );
    if (hasPending && Number(hasPending.cnt) > 0) return new Date().toISOString();
    return null;
  }

  async listFailed(limit = 20): Promise<PendingTask[]> {
    return this.db.allAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY completed_at DESC LIMIT ?`,
      [TaskStatus.FAILED, limit],
    );
  }

  /**
   * List FAILED tasks with a human-readable source resolved, scoped by project.
   * Mirrors listProcessing's COALESCE join so the UI can show which symbol/entry
   * failed (not just a numeric id). Used by GET /api/v1/enrichment/failures to give
   * users full visibility into every failed enrichment task (not just the latest 10).
   * @param limit Max rows to return (caller bounds payload size)
   * @param projectId Optional project scope (omit → all projects)
   */
  async listFailedDetailed(
    limit = 200, projectId?: string,
  ): Promise<Array<{ id: number; source: string; error: string | null; retryCount: number; completedAt: string | null }>> {
    const params: unknown[] = [TaskStatus.FAILED];
    let whereExtra = '';
    if (projectId) {
      whereExtra = ' AND pt.project_id = ?';
      params.push(projectId);
    }
    params.push(limit);
    return this.db.allAsync<{ id: number; source: string; error: string | null; retryCount: number; completedAt: string | null }>(
      `SELECT pt.id,
              COALESCE(ke.source, s.name, 'entry-' || pt.entry_id) as source,
              pt.error as error,
              pt.retry_count as "retryCount",
              pt.completed_at as "completedAt"
       FROM pending_tasks pt
       LEFT JOIN knowledge_entries ke ON ke.id = pt.entry_id AND pt.task_type != 'CODE_ENRICHMENT'
       LEFT JOIN symbols s ON s.id = pt.entry_id AND pt.task_type = 'CODE_ENRICHMENT'
       WHERE pt.status = ?${whereExtra}
       ORDER BY pt.completed_at DESC LIMIT ?`,
      params,
    );
  }

  /** Get currently processing tasks with their source info, scoped by project. */
  async listProcessing(limit = 5, projectId?: string): Promise<Array<{ id: number; source: string; startedAt: string | null }>> {
    const params: unknown[] = [TaskStatus.PROCESSING];
    let whereExtra = '';
    if (projectId) {
      whereExtra = ' AND pt.project_id = ?';
      params.push(projectId);
    }
    params.push(limit);
    return this.db.allAsync<{ id: number; source: string; startedAt: string | null }>(
      `SELECT pt.id, COALESCE(ke.source, s.name, 'entry-' || pt.entry_id) as source, pt.started_at as "startedAt"
       FROM pending_tasks pt
       LEFT JOIN knowledge_entries ke ON ke.id = pt.entry_id AND pt.task_type != 'CODE_ENRICHMENT'
       LEFT JOIN symbols s ON s.id = pt.entry_id AND pt.task_type = 'CODE_ENRICHMENT'
       WHERE pt.status = ?${whereExtra}
       ORDER BY pt.started_at DESC LIMIT ?`,
      params,
    );
  }

  async findById(id: number): Promise<PendingTask | undefined> {
    return this.db.getAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE id = ?`, [id],
    );
  }
}

/** Aggregate grouped status rows into the fixed 4-key stats object. */
function aggregateStatusCounts(
  rows: Array<{ status: string; cnt: number }>,
  coerceNumber: boolean,
): { pending: number; processing: number; completed: number; failed: number } {
  const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof typeof stats;
    if (key in stats) stats[key] = coerceNumber ? Number(row.cnt) : row.cnt;
  }
  return stats;
}
