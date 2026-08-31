/**
 * Unit tests for IndexOperationManager — operation lifecycle in the hot-path
 * Map + cold-path delegation to IndexOperationRepository. Engine is mocked so
 * progress events and background runs can be simulated deterministically.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { IndexOperationManager } from '../index-operation-manager.js';
import { IndexOperationRepository } from '../../../database/repositories/IndexOperationRepository.js';
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
`;

function makeMockEngine() {
  const handlers: Record<string, ((e: any) => void)[]> = {};
  return {
    on: vi.fn((evt: string, cb: (e: any) => void) => {
      (handlers[evt] ||= []).push(cb);
    }),
    emit: (evt: string, payload: any) => handlers[evt]?.forEach((h) => h(payload)),
    runFullIndex: vi.fn(() => new Promise<void>(() => {})), // never resolves (background)
  };
}

let db: Database.Database;
let engine: ReturnType<typeof makeMockEngine>;
let manager: IndexOperationManager;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  engine = makeMockEngine();
  const repo = new IndexOperationRepository(makeTestAdapter(db));
  manager = new IndexOperationManager(engine as any, repo);
});

afterEach(() => db.close());

describe('IndexOperationManager', () => {
  it('startOrReplace registers a running op in hot-path and cold-path', async () => {
    const res = await manager.startOrReplace('u1', 'p1', {} as any);
    expect(res.cancelledPrevious).toBe(false);
    expect(res.operation.status).toBe('running');
    expect(manager.getFromMemory('u1', 'p1')?.status).toBe('running');
    const row = db.prepare('SELECT * FROM index_operations WHERE id=?').get(res.operation.operationId) as Record<string, unknown>;
    expect(row.status).toBe('running');
  });

  it('startOrReplace cancels a prior running op (BR-11 replace)', async () => {
    const first = await manager.startOrReplace('u1', 'p1', {} as any);
    const second = await manager.startOrReplace('u1', 'p1', {} as any);
    expect(second.cancelledPrevious).toBe(true);
    expect(second.cancelledOperationId).toBe(first.operation.operationId);
    expect(manager.getFromMemory('u1', 'p1')?.operationId).toBe(second.operation.operationId);
    const stale = db.prepare('SELECT status FROM index_operations WHERE id=?').get(first.operation.operationId) as Record<string, unknown>;
    expect(stale.status).toBe('superseded');
  });

  it('cancelOperation aborts and marks a running op cancelled', async () => {
    const res = await manager.startOrReplace('u1', 'p1', {} as any);
    const cancelled = manager.cancelOperation('u1', 'p1');
    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe('cancelled');
    expect(cancelled!.operationId).toBe(res.operation.operationId);
    const row = db.prepare('SELECT status FROM index_operations WHERE id=?').get(res.operation.operationId) as Record<string, unknown>;
    expect(row.status).toBe('cancelled');
  });

  it('cancelOperation returns null for unknown tenant', () => {
    expect(manager.cancelOperation('ghost', 'p1')).toBeNull();
  });

  it('updateProgress updates hot state and persists to cold-path', async () => {
    await manager.startOrReplace('u1', 'p1', {} as any);
    manager.updateProgress('u1', 'p1', 'indexing', 5, 10, 'src/a.ts', 2);
    const op = manager.getFromMemory('u1', 'p1')!;
    expect(op.current).toBe(5);
    expect(op.total).toBe(10);
    expect(op.phase).toBe('indexing');
    expect(op.currentFile).toBe('src/a.ts');
    expect(op.checksumStats.files_skipped).toBe(2);
    expect(op.checksumStats.files_processed).toBe(5);
    expect(op.checksumStats.files_pending).toBe(3); // 10 - 5 - 2
    const row = db.prepare('SELECT current, total, phase, current_file FROM index_operations').get() as Record<string, unknown>;
    expect(row.current).toBe(5);
    expect(row.total).toBe(10);
    expect(row.phase).toBe('indexing');
    expect(row.current_file).toBe('src/a.ts');
  });

  it('onEngineProgress routes by projectId and updates matching running op', async () => {
    await manager.startOrReplace('u1', 'p1', {} as any);
    engine.emit('progress', { projectId: 'p1', phase: 'indexing', current: 7, total: 20, currentFile: 'x.ts' });
    const op = manager.getFromMemory('u1', 'p1')!;
    expect(op.current).toBe(7);
    expect(op.total).toBe(20);
  });

  it('getProgress returns idle when nothing in hot or cold path', async () => {
    const evt = await manager.getProgress('nobody', 'p1');
    expect(evt.status).toBe('idle');
    expect(evt.percentage).toBe(0);
  });

  it('getProgress falls back to cold-path when not in memory', async () => {
    await manager.startOrReplace('u1', 'p1', {} as any);
    // Remove from memory to force cold-path (simulate restart).
    (manager as any).operations.clear();
    const evt = await manager.getProgress('u1', 'p1');
    expect(evt.status).toBe('running');
    expect(evt.operationId).toBeTruthy();
  });

  it('persistProgress is a no-op when op absent', () => {
    expect(() => manager.persistProgress('ghost', 'p1')).not.toThrow();
  });

  it('hydrateFromDb loads interrupted records into memory', async () => {
    await manager.startOrReplace('u1', 'p1', {} as any);
    // Mark the persisted op as interrupted directly in DB, then clear memory.
    db.prepare("UPDATE index_operations SET status='interrupted' WHERE user_id='u1' AND project_id='p1'").run();
    (manager as any).operations.clear();
    await manager.hydrateFromDb();
    const op = manager.getFromMemory('u1', 'p1');
    expect(op).toBeDefined();
    expect(op!.status).toBe('interrupted');
  });
});
