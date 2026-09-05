/**
 * Unit tests for IndexOperationRepository — CRUD + lifecycle queries against a
 * real in-memory SQLite adapter (via makeTestAdapter). Covers tenant isolation,
 * progress/status updates, supersede, stale/interrupted lookups, and terminal GC.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IndexOperationRepository } from '../IndexOperationRepository.js';
import { makeTestAdapter } from '../../__tests__/test-adapter.js';

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
`;

let db: Database.Database;
let repo: IndexOperationRepository;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  repo = new IndexOperationRepository(makeTestAdapter(db));
});

afterEach(() => db.close());

describe('IndexOperationRepository', () => {
  it('create inserts a row with server defaults', async () => {
    await repo.create({ user_id: 'u1', project_id: 'p1', status: 'running' });
    const row = db.prepare('SELECT * FROM index_operations').get() as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.project_id).toBe('p1');
    expect(row.status).toBe('running');
    expect(row.phase).toBe('scanning'); // default
    expect(row.current).toBe(0);
    expect(row.total).toBe(0);
  });

  it('create honors explicit optional fields', async () => {
    await repo.create({
      id: 'op-1',
      user_id: 'u1',
      project_id: 'p1',
      status: 'running',
      phase: 'indexing',
      current: 5,
      total: 10,
      current_file: 'src/a.ts',
    });
    const row = db.prepare('SELECT * FROM index_operations WHERE id=?').get('op-1') as Record<string, unknown>;
    expect(row.phase).toBe('indexing');
    expect(row.current).toBe(5);
    expect(row.total).toBe(10);
    expect(row.current_file).toBe('src/a.ts');
  });

  it('updateProgress patches only provided fields', async () => {
    await repo.create({ id: 'op-2', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.updateProgress('op-2', { current: 3, total: 9 });
    const row = db.prepare('SELECT * FROM index_operations WHERE id=?').get('op-2') as Record<string, unknown>;
    expect(row.current).toBe(3);
    expect(row.total).toBe(9);
    expect(row.phase).toBe('scanning'); // unchanged
  });

  it('updateProgress no-op when no fields supplied', async () => {
    await repo.create({ id: 'op-3', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.updateProgress('op-3', {});
    const row = db.prepare('SELECT * FROM index_operations WHERE id=?').get('op-3') as Record<string, unknown>;
    expect(row.phase).toBe('scanning');
  });

  it('updateStatus transitions the record', async () => {
    await repo.create({ id: 'op-4', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.updateStatus('op-4', 'completed');
    const row = db.prepare('SELECT * FROM index_operations WHERE id=?').get('op-4') as Record<string, unknown>;
    expect(row.status).toBe('completed');
  });

  it('supersedeActive marks running/interrupted as superseded and returns count', async () => {
    await repo.create({ id: 'op-5', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.create({ id: 'op-6', user_id: 'u1', project_id: 'p1', status: 'interrupted' });
    await repo.create({ id: 'op-7', user_id: 'u1', project_id: 'p1', status: 'completed' });
    const n = await repo.supersedeActive('u1', 'p1');
    expect(n).toBe(2);
    const rows = db.prepare('SELECT id, status FROM index_operations').all() as Record<string, unknown>[];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId['op-5']).toBe('superseded');
    expect(byId['op-6']).toBe('superseded');
    expect(byId['op-7']).toBe('completed'); // untouched terminal
  });

  it('supersedeActive respects tenant isolation', async () => {
    await repo.create({ id: 'op-8', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.create({ id: 'op-9', user_id: 'u2', project_id: 'p1', status: 'running' });
    const n = await repo.supersedeActive('u1', 'p1');
    expect(n).toBe(1);
    const other = db.prepare('SELECT status FROM index_operations WHERE id=?').get('op-9') as Record<string, unknown>;
    expect(other.status).toBe('running');
  });

  it('findActive returns most-recently-updated running/interrupted record', async () => {
    await repo.create({ id: 'op-10', user_id: 'u1', project_id: 'p1', status: 'running' });
    await repo.create({ id: 'op-11', user_id: 'u1', project_id: 'p1', status: 'completed' });
    const rec = await repo.findActive('u1', 'p1');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('op-10');
    expect(rec!.status).toBe('running');
  });

  it('findActive returns null when no active record', async () => {
    await repo.create({ id: 'op-12', user_id: 'u1', project_id: 'p1', status: 'completed' });
    expect(await repo.findActive('u1', 'p1')).toBeNull();
  });

  it('findStaleRunning returns only running records older than threshold', async () => {
    await repo.create({ id: 'op-13', user_id: 'u1', project_id: 'p1', status: 'running' });
    // Force an old updated_at.
    db.prepare("UPDATE index_operations SET updated_at = ? WHERE id='op-13'").run(
      new Date(Date.now() - 120 * 1000).toISOString(),
    );
    await repo.create({ id: 'op-14', user_id: 'u1', project_id: 'p1', status: 'running' });
    const stale = await repo.findStaleRunning(60);
    expect(stale.map((r) => r.id)).toEqual(['op-13']);
  });

  it('findInterrupted returns only interrupted records', async () => {
    await repo.create({ id: 'op-15', user_id: 'u1', project_id: 'p1', status: 'interrupted' });
    await repo.create({ id: 'op-16', user_id: 'u1', project_id: 'p1', status: 'running' });
    const recs = await repo.findInterrupted();
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe('op-15');
  });

  it('deleteTerminalOlderThan removes only terminal records past retention', async () => {
    await repo.create({ id: 'op-17', user_id: 'u1', project_id: 'p1', status: 'completed' });
    db.prepare("UPDATE index_operations SET updated_at = ? WHERE id='op-17'").run(
      new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    );
    await repo.create({ id: 'op-18', user_id: 'u1', project_id: 'p1', status: 'completed' });
    await repo.create({ id: 'op-19', user_id: 'u1', project_id: 'p1', status: 'running' });
    const n = await repo.deleteTerminalOlderThan(1);
    expect(n).toBe(1); // only op-17 is terminal AND older than 1h
    const remaining = db.prepare('SELECT id FROM index_operations').all() as Record<string, unknown>[];
    expect(remaining.map((r) => r.id).sort()).toEqual(['op-18', 'op-19']);
  });
});
