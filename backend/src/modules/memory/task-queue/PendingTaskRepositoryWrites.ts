/**
 * PendingTaskRepository — write/claim/mutation methods (SA4E-44).
 * Extracted from PendingTaskRepository.ts: task creation, claiming,
 * lifecycle transitions, retry/recovery and housekeeping.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { PendingTask, CreateTaskInput } from './models.js';
import { TaskStatus } from './models.js';
import { PendingTaskRepositoryBase } from './PendingTaskRepositoryBase.js';

/** SA4E-338 S1 (D-SEC-02): bulk retry is bounded to 500 rows per call. */
const RETRY_ALL_MAX_LIMIT = 500;

/** Mutations: create, claim, lifecycle transitions, retry, recovery, purge. */
export class PendingTaskRepositoryWrites extends PendingTaskRepositoryBase {
  constructor(db: DatabaseAdapter) { super(db); }

  async create(input: CreateTaskInput): Promise<number> {
    // Dedup: skip if a PENDING/PROCESSING task already exists for same entry + type
    const existing = await this.db.getAsync<{ id: number }>(
      `SELECT id FROM pending_tasks WHERE entry_id = ? AND task_type = ? AND status IN (?, ?) LIMIT 1`,
      [input.entry_id, input.task_type, TaskStatus.PENDING, TaskStatus.PROCESSING],
    );
    if (existing) return existing.id;

    const result = await this.db.runAsync(
      `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${this.dialect.now()})`,
      [input.task_type, input.entry_id, TaskStatus.PENDING,
        JSON.stringify(input.payload), input.max_retries ?? 3, input.project_id ?? null,
        input.priority ?? 0],
    );
    return result.lastInsertRowid as number;
  }

  async claimNext(): Promise<PendingTask | null> {
    const task = await this.db.getAsync<PendingTask>(
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT 1`,
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
      `SELECT * FROM pending_tasks WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?`,
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

  /**
   * SA4E-338 S1 (D-SEC-02, D-SEC-03, OI-05): reset FAILED tasks to PENDING —
   * bounded + scoped + terminal-safe.
   * - `projectScope` is REQUIRED: no cross-project bulk mutation (JWT pid scope).
   * - Terminal errors (`budget_error:` / `llm_auth:`) are excluded server-side.
   * - At most `limit` rows (default/max 500) are re-queued per call.
   * Uses an id subquery instead of `UPDATE ... LIMIT` — that syntax is not
   * portable to PostgreSQL nor the sqlite-wasm build (same semantics, TDD §7.1).
   * @returns resetCount — number of rows re-queued.
   */
  async retryAllFailed(options: { projectScope: string; limit?: number }): Promise<number> {
    if (!options?.projectScope) throw new Error('retryAllFailed: projectScope is required (D-SEC-02/D-SEC-03)');
    const raw = typeof options.limit === 'number' && Number.isFinite(options.limit) ? Math.trunc(options.limit) : RETRY_ALL_MAX_LIMIT;
    const limit = Math.min(Math.max(raw, 1), RETRY_ALL_MAX_LIMIT);
    const eligibleSelect = `SELECT id FROM pending_tasks
         WHERE status = ?
           AND project_id = ?
           AND (error IS NULL
                OR (error NOT LIKE 'budget_error:%'
                    AND error NOT LIKE 'llm_auth:%'))
         ORDER BY id
         LIMIT ?`;
    const result = await this.db.runAsync(
      `UPDATE pending_tasks
          SET status = ?, started_at = NULL, error = NULL, retry_count = 0
        WHERE id IN (${eligibleSelect})`,
      [TaskStatus.PENDING, TaskStatus.FAILED, options.projectScope, limit],
    );
    return result.changes;
  }

  /**
   * SA4E-165: Reconcile orphan tasks whose entry_id no longer exists.
   * DELETES them entirely — they can never succeed and should not inflate failed counts.
   * Handles both KB tasks (knowledge_entries) and CODE_ENRICHMENT tasks (symbols).
   */
  async reconcileOrphans(): Promise<number> {
    // KB tasks: entry_id references knowledge_entries
    const kbResult = await this.db.runAsync(
      `DELETE FROM pending_tasks
       WHERE status IN (?, ?, ?)
         AND task_type NOT IN ('CODE_ENRICHMENT')
         AND entry_id NOT IN (SELECT id FROM knowledge_entries)`,
      [TaskStatus.PENDING, TaskStatus.PROCESSING, TaskStatus.FAILED],
    );
    // CODE_ENRICHMENT tasks: entry_id references symbols table
    const codeResult = await this.db.runAsync(
      `DELETE FROM pending_tasks
       WHERE status IN (?, ?, ?)
         AND task_type = 'CODE_ENRICHMENT'
         AND entry_id NOT IN (SELECT id FROM symbols)`,
      [TaskStatus.PENDING, TaskStatus.PROCESSING, TaskStatus.FAILED],
    );
    return kbResult.changes + codeResult.changes;
  }

  /**
   * Bound table growth: delete COMPLETED tasks, keeping only the most recent
   * one per (entry_id, task_type). Historical completed rows have no functional
   * value and otherwise accumulate unbounded across re-index/re-enrich runs.
   * @returns number of rows deleted
   */
  async purgeSupersededCompleted(): Promise<number> {
    const result = await this.db.runAsync(
      `DELETE FROM pending_tasks
       WHERE status = ?
         AND id NOT IN (
           SELECT MAX(id) FROM pending_tasks
           WHERE status = ?
           GROUP BY entry_id, task_type
         )`,
      [TaskStatus.COMPLETED, TaskStatus.COMPLETED],
    );
    return result.changes;
  }
}
