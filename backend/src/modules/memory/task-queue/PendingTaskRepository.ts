/**
 * PendingTaskRepository — SA4E-44
 * CRUD operations for the pending_tasks table via DatabaseAdapter.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { PendingTask, CreateTaskInput } from './models.js';
import { TaskStatus } from './models.js';

export class PendingTaskRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  create(input: CreateTaskInput): number {
    const result = this.db.run(
      `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [input.task_type, input.entry_id, TaskStatus.PENDING,
       JSON.stringify(input.payload), input.max_retries ?? 3],
    );
    return result.lastInsertRowid as number;
  }

  claimNext(): PendingTask | null {
    const task = this.db.get<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY created_at ASC LIMIT 1`,
      [TaskStatus.PENDING],
    );
    if (!task) return null;
    const updated = this.db.run(
      `UPDATE pending_tasks SET status = ?, started_at = datetime('now')
       WHERE id = ? AND status = ?`,
      [TaskStatus.PROCESSING, task.id, TaskStatus.PENDING],
    );
    if (updated.changes === 0) return null;
    return { ...task, status: TaskStatus.PROCESSING };
  }

  markCompleted(id: number): void {
    this.db.run(
      `UPDATE pending_tasks SET status = ?, completed_at = datetime('now') WHERE id = ?`,
      [TaskStatus.COMPLETED, id],
    );
  }

  markFailed(id: number, error: string): void {
    this.db.run(
      `UPDATE pending_tasks SET status = ?, error = ?,
       retry_count = retry_count + 1, completed_at = datetime('now') WHERE id = ?`,
      [TaskStatus.FAILED, error, id],
    );
  }

  resetForRetry(id: number): void {
    this.db.run(
      `UPDATE pending_tasks SET status = ?, started_at = NULL, error = NULL WHERE id = ?`,
      [TaskStatus.PENDING, id],
    );
  }

  recoverStaleTasks(staleThresholdMs: number): number {
    const thresholdSec = Math.floor(staleThresholdMs / 1000);
    const result = this.db.run(
      `UPDATE pending_tasks SET status = ?, started_at = NULL
       WHERE status = ? AND started_at < datetime('now', '-' || ? || ' seconds')`,
      [TaskStatus.PENDING, TaskStatus.PROCESSING, thresholdSec],
    );
    return result.changes;
  }

  getStats(): { pending: number; processing: number; completed: number; failed: number } {
    const rows = this.db.all<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*) as cnt FROM pending_tasks GROUP BY status`,
    );
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      const key = row.status.toLowerCase() as keyof typeof stats;
      if (key in stats) stats[key] = row.cnt;
    }
    return stats;
  }

  listFailed(limit = 20): PendingTask[] {
    return this.db.all<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY completed_at DESC LIMIT ?`,
      [TaskStatus.FAILED, limit],
    );
  }

  findById(id: number): PendingTask | undefined {
    return this.db.get<PendingTask>(
      `SELECT * FROM pending_tasks WHERE id = ?`, [id],
    );
  }
}
