/**
 * SA4E-157 — Tests for PendingTaskRepository.getEarliestActiveTimestamp().
 * Verifies the "when did enrichment actually start processing" derivation:
 *   - PROCESSING tasks with a started_at win (MIN)
 *   - falls back to now() when only PENDING tasks exist (freshly retried)
 *   - returns null when there is nothing active
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
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

let db: Database.Database;
let repo: PendingTaskRepository;

function insert(
  entryId: number,
  status: string,
  startedAt: string | null,
  type = TaskType.CODE_ENRICHMENT,
): void {
  db.prepare(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, started_at)
     VALUES (?, ?, ?, '{}', ?)`,
  ).run(type, entryId, status, startedAt);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  repo = new PendingTaskRepository(new SqliteDbAdapter(db) as never);
});

describe('getEarliestActiveTimestamp', () => {
  it('returns null when no tasks exist', async () => {
    expect(await repo.getEarliestActiveTimestamp()).toBeNull();
  });

  it('returns the started_at of a single PROCESSING task', async () => {
    insert(1, TaskStatus.PROCESSING, '2026-01-01T10:00:00.000Z');
    expect(await repo.getEarliestActiveTimestamp()).toBe('2026-01-01T10:00:00.000Z');
  });

  it('returns the MIN started_at among multiple PROCESSING tasks', async () => {
    insert(1, TaskStatus.PROCESSING, '2026-01-01T12:00:00.000Z');
    insert(2, TaskStatus.PROCESSING, '2026-01-01T09:30:00.000Z'); // earliest
    insert(3, TaskStatus.PROCESSING, '2026-01-01T15:00:00.000Z');
    expect(await repo.getEarliestActiveTimestamp()).toBe('2026-01-01T09:30:00.000Z');
  });

  it('ignores PROCESSING tasks whose started_at is NULL and no pending exist → null', async () => {
    insert(1, TaskStatus.PROCESSING, null);
    expect(await repo.getEarliestActiveTimestamp()).toBeNull();
  });

  it('falls back to now() when only PENDING tasks exist', async () => {
    insert(1, TaskStatus.PENDING, null);
    const result = await repo.getEarliestActiveTimestamp();
    expect(result).not.toBeNull();
    // Must be a valid, very recent ISO timestamp
    expect(new Date(result as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('prefers PROCESSING started_at over the PENDING fallback', async () => {
    insert(1, TaskStatus.PENDING, null);
    insert(2, TaskStatus.PROCESSING, '2026-01-01T08:00:00.000Z');
    expect(await repo.getEarliestActiveTimestamp()).toBe('2026-01-01T08:00:00.000Z');
  });

  it('returns null when only COMPLETED/FAILED tasks exist (nothing active)', async () => {
    insert(1, TaskStatus.COMPLETED, '2026-01-01T08:00:00.000Z');
    insert(2, TaskStatus.FAILED, '2026-01-01T08:30:00.000Z');
    expect(await repo.getEarliestActiveTimestamp()).toBeNull();
  });
});
