/**
 * Unit tests for runStartupInterruptDetection — boot-time detection that marks
 * stale `running` records as `interrupted`. The default DB adapter is mocked via
 * `getDbAdapter` so the REAL detector + REAL repository run against an isolated
 * in-memory SQLite DB pre-loaded with the SA4E-101 schema. This exercises the
 * actual detection→update flow plus graceful degradation on DB error (EF-04).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { makeTestAdapter } from '../../../database/__tests__/test-adapter.js';

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

let db: Database.Database;
let allAsyncSpy: ReturnType<typeof vi.fn>;

const realAdapter = () => makeTestAdapter(db);

vi.mock('../../../admin/db/core.js', () => ({
  getDbAdapter: () => ({ ...realAdapter(), allAsync: allAsyncSpy, getEngine: () => 'sqlite' }),
  getActiveEngine: () => 'sqlite',
}));

import { runStartupInterruptDetection } from '../startup-interrupt-detector.js';

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  // Delegate to the real in-memory adapter by default.
  allAsyncSpy = vi.fn((sql: string, params?: unknown[]) => (makeTestAdapter(db) as any).allAsync(sql, params));
});

afterEach(() => db.close());

describe('runStartupInterruptDetection', () => {
  it('does not touch a recently-updated running record (no stale)', async () => {
    db.prepare(
      'INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('op-1', 'u1', 'p1', 'running', new Date().toISOString());
    await runStartupInterruptDetection();
    const row = db.prepare('SELECT status FROM index_operations WHERE id=?').get('op-1') as Record<string, unknown>;
    expect(row.status).toBe('running');
  });

  it('marks each stale running record as interrupted', async () => {
    const old = new Date(Date.now() - 120 * 1000).toISOString();
    const fresh = new Date().toISOString();
    // Distinct tenants (partial unique index allows only ONE running/interrupted per tenant).
    db.prepare('INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      'op-1', 'u1', 'p1', 'running', old,
    );
    db.prepare('INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      'op-2', 'u2', 'p2', 'running', old,
    );
    // A fresh running record must be left untouched.
    db.prepare('INSERT INTO index_operations (id, user_id, project_id, status, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      'op-3', 'u3', 'p3', 'running', fresh,
    );
    await runStartupInterruptDetection();
    const statuses = db
      .prepare('SELECT id, status FROM index_operations')
      .all() as Record<string, unknown>[];
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
