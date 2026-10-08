/**
 * SA4E-338 S1 — Tests for PendingTaskRepository.retryAllFailed() hardening.
 * Traces: D-SEC-02/D-SEC-03/D-SEC-04 (TDD §7.1), OI-05, TC-SEC-01b/01c/01e,
 * STC UT-53 (terminal non-retryable) + IT-10 (scope/LIMIT/terminal exclusion).
 * Runs real SQL against an in-memory SQLite (same pattern as PendingTaskRepository.purge.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskStatus, TaskType } from '../models.js';

const SCHEMA = `
  CREATE TABLE pending_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    entry_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    project_id TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
  );
`;

let db: SqliteAdapter;
let repo: PendingTaskRepository;

async function insertTask(
  entryId: number, status: string, projectId: string | null, error: string | null,
  retryCount = 1, type = TaskType.CODE_ENRICHMENT,
): Promise<void> {
  await db.run(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, error, retry_count, started_at, project_id)
     VALUES (?, ?, ?, '{}', ?, ?, '2026-01-01T00:00:00Z', ?)`,
    [type, entryId, status, error, retryCount, projectId],
  );
}

async function rowsByStatus(status: string, projectId: string) {
  return await db.all(
    `SELECT entry_id, error, retry_count, started_at FROM pending_tasks WHERE status = ? AND project_id = ? ORDER BY entry_id`,
    [status, projectId],
  ) as { entry_id: number; error: string | null; retry_count: number; started_at: string | null }[];
}

beforeEach(async () => {
  db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(SCHEMA);
  repo = new PendingTaskRepository(new SqliteDbAdapter(db as any) as never);
});

describe('retryAllFailed (S1: scope + LIMIT + terminal exclusion)', () => {
  it('re-queues only non-terminal FAILED tasks of the scope project (TC-SEC-01b)', async () => {
    await insertTask(1, TaskStatus.FAILED, 'proj-A', 'llm_timeout: aborted');
    await insertTask(2, TaskStatus.FAILED, 'proj-A', 'budget_error: max_reduce_rounds');
    await insertTask(3, TaskStatus.FAILED, 'proj-A', 'llm_auth: 401 unauthorized');
    await insertTask(4, TaskStatus.FAILED, 'proj-A', null);

    const reset = await repo.retryAllFailed({ projectScope: 'proj-A' });

    expect(reset).toBe(2); // entries 1 (transient) + 4 (null error)
    const pending = await rowsByStatus(TaskStatus.PENDING, 'proj-A');
    expect(pending.map(r => r.entry_id)).toEqual([1, 4]);
    // reset rows: error cleared, retry_count reset, started_at cleared
    expect(pending[0]).toMatchObject({ error: null, retry_count: 0, started_at: null });
    // terminal rows untouched — still FAILED with their error preserved (OI-05/D-SEC-04)
    const failed = await rowsByStatus(TaskStatus.FAILED, 'proj-A');
    expect(failed.map(r => r.entry_id)).toEqual([2, 3]);
    expect(failed.map(r => r.error)).toEqual(['budget_error: max_reduce_rounds', 'llm_auth: 401 unauthorized']);
  });

  it('never touches another project (TC-SEC-01c / D-SEC-03)', async () => {
    await insertTask(10, TaskStatus.FAILED, 'proj-A', 'transient');
    await insertTask(11, TaskStatus.FAILED, 'proj-B', 'transient');

    const reset = await repo.retryAllFailed({ projectScope: 'proj-A' });

    expect(reset).toBe(1);
    const other = await rowsByStatus(TaskStatus.FAILED, 'proj-B');
    expect(other.map(r => r.entry_id)).toEqual([11]);
  });

  it('caps the number of re-queued rows at the requested limit (default 500)', async () => {
    await insertTask(1, TaskStatus.FAILED, 'proj-A', 't1');
    await insertTask(2, TaskStatus.FAILED, 'proj-A', 't2');
    await insertTask(3, TaskStatus.FAILED, 'proj-A', 't3');

    const reset = await repo.retryAllFailed({ projectScope: 'proj-A', limit: 2 });

    expect(reset).toBe(2);
    const failed = await rowsByStatus(TaskStatus.FAILED, 'proj-A');
    expect(failed.map(r => r.entry_id)).toEqual([3]); // only the first 2 by id were reset
  });

  it('never exceeds the 500-row hard cap even when a larger limit is requested', async () => {
    for (let i = 1; i <= 501; i++) await insertTask(i, TaskStatus.FAILED, 'proj-A', 'transient');

    const reset = await repo.retryAllFailed({ projectScope: 'proj-A', limit: 99999 });

    expect(reset).toBe(500);
    const failed = await rowsByStatus(TaskStatus.FAILED, 'proj-A');
    expect(failed).toHaveLength(1);
  });

  it('leaves PENDING/PROCESSING/COMPLETED rows alone', async () => {
    await insertTask(1, TaskStatus.PENDING, 'proj-A', null);
    await insertTask(2, TaskStatus.PROCESSING, 'proj-A', null);
    await insertTask(3, TaskStatus.COMPLETED, 'proj-A', null);
    await insertTask(4, TaskStatus.FAILED, 'proj-A', 'transient');

    const reset = await repo.retryAllFailed({ projectScope: 'proj-A' });

    expect(reset).toBe(1);
    const counts = await db.all(
      `SELECT status, COUNT(*) AS c FROM pending_tasks GROUP BY status ORDER BY status`,
    ) as unknown;
    expect(counts).toEqual([
      { status: 'COMPLETED', c: 1 },
      { status: 'PENDING', c: 2 }, // original + reset row
      { status: 'PROCESSING', c: 1 },
    ]);
  });

  it('fails closed when projectScope is missing or empty (D-SEC-02)', async () => {
    await expect(repo.retryAllFailed({ projectScope: '' })).rejects.toThrow(/projectScope is required/);
    await expect(repo.retryAllFailed(undefined as never)).rejects.toThrow(/projectScope is required/);
  });

  it('returns 0 when no non-terminal FAILED task matches the scope', async () => {
    await insertTask(1, TaskStatus.FAILED, 'proj-A', 'budget_error: x');
    expect(await repo.retryAllFailed({ projectScope: 'proj-A' })).toBe(0);
  });
});
