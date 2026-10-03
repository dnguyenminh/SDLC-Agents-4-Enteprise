/**
 * Unit tests for runStartupInterruptDetection — boot-time detection that marks
 * stale `running` records as `interrupted`. The default DB adapter is mocked via
 * `getDbAdapter` so the REAL detector + REAL repository run against an isolated
 * in-memory SQLite DB pre-loaded with the SA4E-101 schema. This exercises the
 * actual detection→update flow plus graceful degradation on DB error (EF-04).
 *
 * Uses SqliteAdapter (production SQLite adapter, in-memory) so tests no longer
 * depend on native bindings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adapterFromSqlite, makeSqliteTestDb, type SqliteTestDb } from '../../../database/__tests__/sqlite-test-adapter.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

const SCHEMA = `
CREATE TABLE index_operations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','interrupted','completed','cancelled','failed','superseded')),
  phase        TEXT NOT NULL DEFAULT 'scanning',
  current      INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  current_file TEXT,
  started_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_operations_active_tenant
  ON index_operations (user_id, project_id) WHERE status IN ('running','interrupted');
`;

let db: SqliteTestDb;
let adapter: DatabaseAdapter;
let allAsyncSpy: ReturnType<typeof vi.fn>;

vi.mock('../../../admin/db/core.js', () => ({
  getDbAdapter: () => ({ ...adapter, allAsync: allAsyncSpy, getEngine: () => 'sqlite' }),
  getActiveEngine: () => 'sqlite',
}));

import {
  markInFlightOperationsInterrupted,
  runStartupInterruptDetection,
  startInterruptDetectionScheduler,
  stopInterruptDetectionScheduler,
} from '../startup-interrupt-detector.js';

beforeEach(async () => {
  db = await makeSqliteTestDb();
  adapter = adapterFromSqlite(db.adapter);
  adapter.exec(SCHEMA);
  // Delegate to the real in-memory adapter by default.
  allAsyncSpy = vi.fn((sql: string, params?: unknown[]) => adapter.allAsync(sql, params));
});

afterEach(async () => {
  await db.close();
});

describe('runStartupInterruptDetection', () => {
  it('does not touch a recently-updated running record (no stale)', async () => {
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-1', 'u1', 'p1', 'running', new Date().toISOString()],
    );
    await runStartupInterruptDetection();
    const row = adapter.get<{ status: string }>('SELECT status FROM index_operations WHERE id=?', ['op-1']);
    expect(row?.status).toBe('running');
  });

  it('marks each stale running record as interrupted', async () => {
    const old = new Date(Date.now() - 120 * 1000).toISOString();
    const fresh = new Date().toISOString();
    // Distinct tenants (partial unique index allows only ONE running/interrupted per tenant).
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-1', 'u1', 'p1', 'running', old],
    );
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-2', 'u2', 'p2', 'running', old],
    );
    // A fresh running record must be left untouched.
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-3', 'u3', 'p3', 'running', fresh],
    );
    await runStartupInterruptDetection();
    const statuses = adapter.all<{ id: string; status: string }>('SELECT id, status FROM index_operations');
    const byId = Object.fromEntries(statuses.map((r) => [r.id, r.status]));
    expect(byId['op-1']).toBe('interrupted');
    expect(byId['op-2']).toBe('interrupted');
    expect(byId['op-3']).toBe('running'); // not stale
  });

  it('degrades gracefully on DB error (continues startup)', async () => {
    allAsyncSpy.mockRejectedValueOnce(new Error('db down'));
    await expect(runStartupInterruptDetection()).resolves.toBeUndefined();
  });

  it('accepts a custom staleness threshold', async () => {
    // 5s old: stale under threshold 0, but fresh under the default 60s.
    const recent = new Date(Date.now() - 5_000).toISOString();
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-t1', 'u1', 'p1', 'running', recent],
    );
    await runStartupInterruptDetection(0);
    const row = adapter.get<{ status: string }>('SELECT status FROM index_operations WHERE id=?', ['op-t1']);
    expect(row?.status).toBe('interrupted');
  });

  it('markInFlightOperationsInterrupted flips ALL running rows (shutdown path)', async () => {
    const recent = new Date(Date.now() - 5_000).toISOString();
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-s1', 'u1', 'p1', 'running', recent],
    );
    adapter.run(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['op-s2', 'u2', 'p2', 'completed', recent],
    );
    await markInFlightOperationsInterrupted();
    const rows = adapter.all<{ id: string; status: string }>('SELECT id, status FROM index_operations');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId['op-s1']).toBe('interrupted'); // running -> interrupted
    expect(byId['op-s2']).toBe('completed'); // terminal untouched
  });
});

describe('periodic interrupt-detection scheduler', () => {
  it('re-arms detection every 60s with the 10-minute threshold (idempotent start/stop)', async () => {
    vi.useFakeTimers();
    try {
      startInterruptDetectionScheduler();
      startInterruptDetectionScheduler(); // idempotent — must not double-schedule
      expect(allAsyncSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(allAsyncSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = allAsyncSpy.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/status = 'running'/);
      // findStaleRunning(600) => cutoff = now - 600s
      const cutoff = new Date(params[0] as string).getTime();
      expect(Math.abs(cutoff - (Date.now() - 600_000))).toBeLessThan(5_000);
    } finally {
      stopInterruptDetectionScheduler();
      stopInterruptDetectionScheduler(); // idempotent
      vi.useRealTimers();
    }
  });
});
