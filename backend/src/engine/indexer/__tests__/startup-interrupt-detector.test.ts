/**
 * Unit tests for runStartupInterruptDetection — boot-time detection that marks
 * stale `running` records as `interrupted`. The default DB adapter is mocked via
 * `getDbAdapter` so the REAL detector + REAL repository run against an isolated
 * in-memory SQLite DB pre-loaded with the SA4E-101 schema. This exercises the
 * actual detection→update flow plus graceful degradation on DB error (EF-04).
 *
 * Uses SqliteAdapter (production SQLite adapter, in-memory) so tests no longer
 * depend on native better-sqlite3.
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

import { runStartupInterruptDetection } from '../startup-interrupt-detector.js';

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
    expect(row.status).toBe('running');
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
});
