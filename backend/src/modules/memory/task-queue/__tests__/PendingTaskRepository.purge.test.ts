/**
 * SA4E — Tests for PendingTaskRepository.purgeSupersededCompleted().
 * Verifies COMPLETED task retention: keep only the latest completed task per
 * (entry_id, task_type); never touch PENDING/PROCESSING/FAILED rows.
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

async function insert(entryId: number, status: string, type = TaskType.CODE_ENRICHMENT): Promise<void> {
  await db.run(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload) VALUES (?, ?, ?, '{}')`,
    [type, entryId, status]
  );
}

beforeEach(async () => {
  db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(SCHEMA);
  repo = new PendingTaskRepository(new SqliteDbAdapter(db as any) as never);
});

describe('purgeSupersededCompleted', () => {
  it('keeps only the latest COMPLETED task per entry+type', async () => {
    await insert(100, TaskStatus.COMPLETED);
    await insert(100, TaskStatus.COMPLETED);
    await insert(100, TaskStatus.COMPLETED);

    const deleted = await repo.purgeSupersededCompleted();

    expect(deleted).toBe(2);
    const rows = await db.all(`SELECT id FROM pending_tasks WHERE entry_id = 100`) as { id: number }[];
    expect(rows).toHaveLength(1);
  });

  it('never deletes PENDING, PROCESSING or FAILED tasks', async () => {
    await insert(200, TaskStatus.COMPLETED);
    await insert(200, TaskStatus.COMPLETED);
    await insert(200, TaskStatus.PENDING);
    await insert(200, TaskStatus.PROCESSING);
    await insert(200, TaskStatus.FAILED);

    await repo.purgeSupersededCompleted();

    const active = await db.all(
      `SELECT status FROM pending_tasks WHERE entry_id = 200 AND status != ?`,
      [TaskStatus.COMPLETED]
    ) as { status: string }[];
    expect(active.map(r => r.status).sort()).toEqual(['FAILED', 'PENDING', 'PROCESSING']);
    const completed = await db.all(
      `SELECT id FROM pending_tasks WHERE entry_id = 200 AND status = ?`,
      [TaskStatus.COMPLETED]
    );
    expect(completed).toHaveLength(1);
  });

  it('retains one COMPLETED per distinct entry+type', async () => {
    await insert(1, TaskStatus.COMPLETED);
    await insert(1, TaskStatus.COMPLETED);
    await insert(2, TaskStatus.COMPLETED);
    await insert(1, TaskStatus.COMPLETED, TaskType.TAG_ENRICHMENT);

    const deleted = await repo.purgeSupersededCompleted();

    expect(deleted).toBe(1);
    const total = await db.get(`SELECT COUNT(*) AS c FROM pending_tasks`) as { c: number };
    expect(total.c).toBe(3);
  });

  it('returns 0 when there is nothing to purge', async () => {
    await insert(9, TaskStatus.COMPLETED);
    expect(await repo.purgeSupersededCompleted()).toBe(0);
  });
});
