/**
 * SA4E-339 — VECTOR_EMBEDDING persistence regression tests.
 *
 * Bug: processVectorEmbeddingTask ran `UPDATE knowledge_entries SET vector = ?`
 * but knowledge_entries has no `vector` column (SQLITE_ERROR), so KB embeddings
 * were never persisted and vector search over the KB was silently broken.
 *
 * Fix contract: the embedding is UPSERTED into the dedicated `knowledge_vectors`
 * store (the table kb-embeddings.ts READS via JOIN v.entry_id and engine CRUD
 * cleans via DELETE WHERE entry_id), recording the producing model; an entry
 * deleted after enqueue completes the task instead of failing on the FK.
 *
 * In-memory SQLite + MEMORY_SCHEMA — mirrors TaskWorker.it-*.test.ts fixtures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { MemoryEngine } from '../../engine/index.js';
import { MEMORY_SCHEMA } from '../../schema/index.js';
import { processVectorEmbeddingTask } from '../code-summary.js';
import type { CodeSummaryDeps } from '../worker-context.js';
import type { PendingTask } from '../models.js';

const logger = pino({ level: 'silent' });

const PENDING_TASKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS pending_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    entry_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload TEXT NOT NULL,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    project_id TEXT DEFAULT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
  );
`;

/** Exactly f32-representable values so a Float32 blob round-trips bit-exact. */
const VECTOR_A = [0.5, -1.25, 2, 0, 3.75, -0.5];
const VECTOR_B = [1, 2, 3, 4, 5, 6];
const MODEL_ID = 'test-embedding-model';

function fakeEmbeddingService(vector: number[]) {
  return {
    generateEmbeddingDetailed: vi.fn(async () => ({ vector, modelId: MODEL_ID })),
  } as never;
}

function fakeRepo() {
  return { markCompleted: vi.fn(), resetForRetry: vi.fn() };
}

describe('SA4E-339: processVectorEmbeddingTask persists into knowledge_vectors', () => {
  let db: SqliteAdapter;
  let deps: CodeSummaryDeps;
  let repo: ReturnType<typeof fakeRepo>;
  let entryId: number;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await db.connect();
    await db.exec(MEMORY_SCHEMA);
    await db.exec(PENDING_TASKS_SCHEMA);
    const adapter = new SqliteDbAdapter(db as never);
    const engine = new MemoryEngine(adapter);
    engine.startSession('test');
    repo = fakeRepo();
    const res = await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type) VALUES (?, ?, ?)`,
      ['entry body text', 'entry summary', 'document'],
    );
    entryId = Number(res.lastInsertRowid);
    deps = { repo: repo as never, engine, config: {} as never, logger };
  });

  function makeTask(): PendingTask {
    return {
      id: 1, task_type: 'VECTOR_EMBEDDING', entry_id: entryId,
      payload: JSON.stringify({ text: 'entry body text' }),
    } as never;
  }

  it('persists the embedding into knowledge_vectors with model + dimensions provenance', async () => {
    deps.embeddingService = fakeEmbeddingService(VECTOR_A);

    await processVectorEmbeddingTask(deps, makeTask(), { text: 'entry body text' });

    expect(repo.markCompleted).toHaveBeenCalledTimes(1);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
    const row = await db.getAsync<{ entry_id: number; vector: Buffer; model: string; dimensions: number }>(
      'SELECT entry_id, vector, model, dimensions FROM knowledge_vectors WHERE entry_id = ?',
      [entryId],
    );
    expect(row).toBeDefined();
    expect(row!.model).toBe(MODEL_ID);
    expect(row!.dimensions).toBe(VECTOR_A.length);
    const decoded = Array.from(new Float32Array(row!.vector.buffer, row!.vector.byteOffset, row!.vector.byteLength / 4));
    expect(decoded).toEqual(VECTOR_A);
  });

  it('UPSERTs on re-embedding the same entry (one row, latest vector + model wins)', async () => {
    deps.embeddingService = fakeEmbeddingService(VECTOR_A);
    await processVectorEmbeddingTask(deps, makeTask(), { text: 'entry body text' });

    deps.embeddingService = fakeEmbeddingService(VECTOR_B);
    await processVectorEmbeddingTask(deps, makeTask(), { text: 'entry body text' });

    const rows = await db.allAsync<{ entry_id: number; vector: Buffer; model: string }>(
      'SELECT entry_id, vector, model FROM knowledge_vectors WHERE entry_id = ?',
      [entryId],
    );
    expect(rows).toHaveLength(1); // UNIQUE(entry_id) — no duplicate rows
    expect(rows[0].model).toBe(MODEL_ID);
    const decoded = Array.from(new Float32Array(rows[0].vector.buffer, rows[0].vector.byteOffset, rows[0].vector.byteLength / 4));
    expect(decoded).toEqual(VECTOR_B); // latest embedding wins
  });

  it('completes without writing when the entry was deleted after enqueue (obsolete, FK-safe)', async () => {
    deps.embeddingService = fakeEmbeddingService(VECTOR_A);
    await db.runAsync('DELETE FROM knowledge_entries WHERE id = ?', [entryId]);

    await processVectorEmbeddingTask(deps, makeTask(), { text: 'entry body text' });

    expect(repo.markCompleted).toHaveBeenCalledTimes(1); // obsolete — not a failure/retry
    expect(repo.resetForRetry).not.toHaveBeenCalled();
    const rows = await db.allAsync('SELECT * FROM knowledge_vectors WHERE entry_id = ?', [entryId]);
    expect(rows).toHaveLength(0); // nothing written for a deleted entry
  });

  it('resets for retry when no embeddingService is wired (backend not ready)', async () => {
    await processVectorEmbeddingTask(deps, makeTask(), { text: 'entry body text' });

    expect(repo.resetForRetry).toHaveBeenCalledTimes(1);
    expect(repo.markCompleted).not.toHaveBeenCalled();
    const rows = await db.allAsync('SELECT * FROM knowledge_vectors');
    expect(rows).toHaveLength(0);
  });
});
