/**
 * SA4E-336 — `symbol_sync_error` root-cause regression.
 *
 * SQLite built `body_embeddings` with UNIQUE(symbol_id, chunk_index) while
 * PegaSymbolSync.storeBodyEmbedding upserts with
 * ON CONFLICT(project_id, symbol_id, chunk_index). SQLite rejects a conflict
 * target matching no unique index at statement prepare, so EVERY Pega rule sync
 * failed and surfaced as `symbol_sync_error` in bulk-check. Unit tests missed it
 * because PegaSymbolSync.test.ts mocks the adapter and the e2e test declares its
 * own (correct) schema — schema drift between test and production.
 *
 * These tests run against a REAL SQLite adapter and the EXACT upsert SQL, plus
 * the runMigrations call sites that install the missing index.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { runMigrations, ensureBodyEmbeddingsUpsertIndex } from '../migrations.js';
import { runGraphMigrations } from '../../graph/migrator.js';
import { syncRuleToSymbols } from '../../../modules/pega/PegaSymbolSync.js';

/** body_embeddings as built by the historical V3 DDL (the broken shape). */
const LEGACY_BODY_EMBEDDINGS = `
CREATE TABLE body_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  symbol_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding BYTEA NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(symbol_id, chunk_index)
);`;

/** body_embeddings as built before V5 ever ran (no project_id column at all). */
const PRE_V5_BODY_EMBEDDINGS = `
CREATE TABLE body_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding BYTEA NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(symbol_id, chunk_index)
);`;

/** Exact SQLite upsert from PegaSymbolSync.storeBodyEmbedding (the failing statement). */
const PEGA_BODY_UPSERT = `INSERT INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count)
 VALUES (?, ?, 0, ?, ?)
 ON CONFLICT(project_id, symbol_id, chunk_index) DO UPDATE SET
   embedding = excluded.embedding, token_count = excluded.token_count`;

function uniqueIndexColumns(adapter: SqliteAdapter, table: string): string[] {
  const indexes = adapter.all<{ name: string; unique: number }>(`PRAGMA index_list(${table})`);
  for (const idx of indexes) {
    if (idx.unique !== 1) continue;
    const cols = adapter.all<{ name: string }>(`PRAGMA index_info('${idx.name}')`);
    return cols.map((c) => c.name);
  }
  return [];
}

/** FK target: body_embeddings.symbol_id -> symbols(id) is enforced on the fresh schema. */
async function seedSymbol(adapter: SqliteAdapter): Promise<number> {
  if (adapter.all<{ name: string }>('PRAGMA table_info(symbols)').length === 0) return 1;
  await adapter.runAsync(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES ('proj1', 'pega/virtual.pegajson', 'pega/virtual.pegajson', 'pega', 'mod', 'h', 1, 1)`,
  );
  const sym = await adapter.runAsync(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line)
     VALUES ('proj1', last_insert_rowid(), 'ApproveLeave', 'pega_activity', 'sig', 1, 1)`,
  );
  return Number(sym.lastInsertRowid);
}

async function expectUpsertWorks(adapter: SqliteAdapter): Promise<void> {
  const symbolId = await seedSymbol(adapter);
  await adapter.runAsync(PEGA_BODY_UPSERT, ['proj1', symbolId, Buffer.from('body'), 5]);
  await adapter.runAsync(PEGA_BODY_UPSERT, ['proj1', symbolId, Buffer.from('body2'), 7]);
  const row = adapter.get<{ n: number }>(
    `SELECT COUNT(*) as n FROM body_embeddings WHERE project_id = 'proj1' AND symbol_id = ?`,
    [symbolId],
  );
  expect(row?.n).toBe(1);
}

describe('SA4E-336 body_embeddings upsert index (symbol_sync_error)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('installs the index on the legacy shape and makes the Pega upsert succeed', async () => {
    adapter.exec(LEGACY_BODY_EMBEDDINGS);
    await ensureBodyEmbeddingsUpsertIndex(adapter as never);
    expect(uniqueIndexColumns(adapter, 'body_embeddings')).toEqual(
      ['project_id', 'symbol_id', 'chunk_index'],
    );
    await expectUpsertWorks(adapter);
  });

  it('adds the missing project_id column before indexing (pre-V5 table)', async () => {
    adapter.exec(PRE_V5_BODY_EMBEDDINGS);
    await ensureBodyEmbeddingsUpsertIndex(adapter as never);
    const cols = adapter.all<{ name: string }>('PRAGMA table_info(body_embeddings)').map(c => c.name);
    expect(cols).toContain('project_id');
    await expectUpsertWorks(adapter);
  });

  it('is idempotent', async () => {
    adapter.exec(LEGACY_BODY_EMBEDDINGS);
    await ensureBodyEmbeddingsUpsertIndex(adapter as never);
    await expect(ensureBodyEmbeddingsUpsertIndex(adapter as never)).resolves.not.toThrow();
    await expectUpsertWorks(adapter);
  });

  it('is a no-op when the table does not exist yet', async () => {
    await expect(ensureBodyEmbeddingsUpsertIndex(adapter as never)).resolves.not.toThrow();
  });

  it('runMigrations fixes an already-migrated DB (schema_version=5 early-return path)', async () => {
    adapter.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO schema_version (version) VALUES (5);
      CREATE TABLE mcp_tools (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT, schema_json TEXT NOT NULL, category TEXT, server TEXT);
      CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', path TEXT NOT NULL, relative_path TEXT NOT NULL, language TEXT NOT NULL, module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL, line_count INTEGER NOT NULL DEFAULT 0, file_created_at TEXT, file_author TEXT, file_version TEXT, UNIQUE(project_id, path));
    `);
    adapter.exec(LEGACY_BODY_EMBEDDINGS);

    await runMigrations(adapter as never, 'proj1');

    expect(uniqueIndexColumns(adapter, 'body_embeddings')).toEqual(
      ['project_id', 'symbol_id', 'chunk_index'],
    );
    await expectUpsertWorks(adapter);
  });

  it('runMigrations indexes a fresh DB (body_embeddings created by V3)', async () => {
    await runMigrations(adapter as never, 'proj1');
    expect(uniqueIndexColumns(adapter, 'body_embeddings')).toEqual(
      ['project_id', 'symbol_id', 'chunk_index'],
    );
    await expectUpsertWorks(adapter);
  });

  it('syncRuleToSymbols (the real production call) succeeds on the boot schema path', async () => {
    // HttpServer boot order: runMigrations -> runGraphMigrations -> pending_tasks.
    await runMigrations(adapter as never, 'proj1');
    await runGraphMigrations(adapter);
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS pending_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT, entry_id INTEGER, status TEXT, payload TEXT,
        max_retries INTEGER DEFAULT 3, project_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT, completed_at TEXT, error TEXT, retry_count INTEGER DEFAULT 0
      );`);

    const result = await syncRuleToSymbols(
      adapter,
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work-HR', pyRuleName: 'ApproveLeave' },
      'proj1', 'prompt context', 'c'.repeat(64),
    );

    expect(result).not.toBeNull();
    expect(result?.symbolId).toBeGreaterThan(0);
    const body = adapter.get<{ n: number }>(
      `SELECT COUNT(*) as n FROM body_embeddings WHERE project_id = 'proj1'`,
    );
    expect(body?.n).toBe(1);
  });
});
