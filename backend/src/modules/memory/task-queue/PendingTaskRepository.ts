/**
 * PendingTaskRepository — SA4E-44
 * CRUD operations for the pending_tasks table via DatabaseAdapter.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { PendingTask, CreateTaskInput } from './models.js';
import { TaskStatus } from './models.js';

export class PendingTaskRepository {
  private readonly dialect: DialectHelper;

  constructor(private readonly db: DatabaseAdapter) {
    this.dialect = new DialectHelper(db.getEngine());
  }

  async create(input: CreateTaskInput): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, created_at)
       VALUES (?, ?, ?, ?, ?, ${this.dialect.now()})`,
      [input.task_type, input.entry_id, TaskStatus.PENDING,
       JSON.stringify(input.payload), input.max_retries ?? 3],
    );
    return result.lastInsertRowid as number;
  }

  async claimNext(): Promise<PendingTask | null> {
    const task = await this.db.getAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY created_at ASC LIMIT 1`,
      [TaskStatus.PENDING],
    );
    if (!task) return null;
    const updated = await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, started_at = ${this.dialect.now()}
       WHERE id = ? AND status = ?`,
      [TaskStatus.PROCESSING, task.id, TaskStatus.PENDING],
    );
    if (updated.changes === 0) return null;
    return { ...task, status: TaskStatus.PROCESSING };
  }

  /**
   * Claim up to `count` PENDING tasks atomically.
   * Each task is claimed individually (optimistic lock on status) to avoid
   * concurrent workers racing on the same row.
   */
  async claimBatch(count: number): Promise<PendingTask[]> {
    const candidates = await this.db.allAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY created_at ASC LIMIT ?`,
      [TaskStatus.PENDING, count],
    );
    const claimed: PendingTask[] = [];
    for (const task of candidates) {
      const updated = await this.db.runAsync(
        `UPDATE pending_tasks SET status = ?, started_at = ${this.dialect.now()}
         WHERE id = ? AND status = ?`,
        [TaskStatus.PROCESSING, task.id, TaskStatus.PENDING],
      );
      if (updated.changes > 0) claimed.push({ ...task, status: TaskStatus.PROCESSING });
    }
    return claimed;
  }

  async markCompleted(id: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, completed_at = ${this.dialect.now()} WHERE id = ?`,
      [TaskStatus.COMPLETED, id],
    );
  }

  async markFailed(id: number, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, error = ?,
       retry_count = retry_count + 1, completed_at = ${this.dialect.now()} WHERE id = ?`,
      [TaskStatus.FAILED, error, id],
    );
  }

  async resetForRetry(id: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, started_at = NULL, error = NULL WHERE id = ?`,
      [TaskStatus.PENDING, id],
    );
  }

  async recoverStaleTasks(staleThresholdMs: number): Promise<number> {
    const thresholdSec = Math.floor(staleThresholdMs / 1000);
    // SQLite uses datetime('now', '-N seconds'); PostgreSQL uses NOW() - INTERVAL 'N seconds'
    const engine = this.db.getEngine();
    const staleCondition = engine === 'sqlite'
      ? `started_at < datetime('now', '-' || ? || ' seconds')`
      : `started_at < NOW() - INTERVAL '1 second' * ?`;
    const result = await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, started_at = NULL
       WHERE status = ? AND ${staleCondition}`,
      [TaskStatus.PENDING, TaskStatus.PROCESSING, thresholdSec],
    );
    return result.changes;
  }

  /**
   * Reset ALL PROCESSING tasks to PENDING unconditionally.
   * Called once at server startup to recover from previous crash/restart.
   * No time threshold — any PROCESSING task after restart is by definition stale.
   */
  async resetAllProcessing(): Promise<number> {
    const result = await this.db.runAsync(
      `UPDATE pending_tasks SET status = ?, started_at = NULL WHERE status = ?`,
      [TaskStatus.PENDING, TaskStatus.PROCESSING],
    );
    return result.changes;
  }

  async getStats(): Promise<{ pending: number; processing: number; completed: number; failed: number }> {
    const rows = await this.db.allAsync<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*) as cnt FROM pending_tasks GROUP BY status`,
    );
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      const key = row.status.toLowerCase() as keyof typeof stats;
      if (key in stats) stats[key] = row.cnt;
    }
    return stats;
  }

  async listFailed(limit = 20): Promise<PendingTask[]> {
    return this.db.allAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY completed_at DESC LIMIT ?`,
      [TaskStatus.FAILED, limit],
    );
  }

  async findById(id: number): Promise<PendingTask | undefined> {
    return this.db.getAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE id = ?`, [id],
    );
  }
}
