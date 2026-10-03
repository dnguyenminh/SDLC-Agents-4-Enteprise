/**
 * Fresh-DB provenance columns — regression test for the `no column named
 * file_created_at` full-index crash.
 *
 * Root cause: SCHEMA_V1 created `files` WITH project_id but WITHOUT
 * file_created_at/file_author/file_version, and V5's recreateFiles() returns
 * early when project_id exists — so every fresh SQLite DB missed the columns
 * that registerFilesForIndex INSERTs. The unconditional ensure in
 * runMigrations closes that gap for already-created DB files.
 * Runs on an isolated in-memory DB (never the live index.db).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { migrateAddFilesProvenanceColumns } from '../migrations.js';

/** `files` table as built on a fresh DB before the fix (has project_id, no provenance cols). */
const FRESH_BROKEN_FILES = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  language TEXT NOT NULL,
  module TEXT,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
  line_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, path)
);`;

/** Exact sqlite INSERT built by IndexingEngine.registerFilesForIndex. */
const REGISTER_INSERT = `INSERT OR REPLACE INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`;

function columnNames(adapter: SqliteAdapter): string[] {
  return adapter.all<{ name: string }>(`PRAGMA table_info(files)`).map(r => r.name);
}

describe('files provenance columns ensure', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(FRESH_BROKEN_FILES);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('adds the three missing provenance columns', async () => {
    await migrateAddFilesProvenanceColumns(adapter as any);
    const cols = columnNames(adapter);
    expect(cols).toContain('file_created_at');
    expect(cols).toContain('file_author');
    expect(cols).toContain('file_version');
  });

  it('makes the registerFilesForIndex INSERT succeed', async () => {
    await migrateAddFilesProvenanceColumns(adapter as any);
    await adapter.runAsync(REGISTER_INSERT,
      ['p1', '/w/src/a.ts', 'src/a.ts', 'typescript', 'src', 'h1', 100, 10, null, null, null]);
    expect(adapter.get<{ c: number }>('SELECT COUNT(*) as c FROM files')?.c).toBe(1);
  });

  it('is idempotent and preserves existing rows', async () => {
    await migrateAddFilesProvenanceColumns(adapter as any);
    await adapter.runAsync(REGISTER_INSERT,
      ['p1', '/w/src/a.ts', 'src/a.ts', 'typescript', 'src', 'h1', 100, 10, null, null, null]);
    await expect(migrateAddFilesProvenanceColumns(adapter as any)).resolves.not.toThrow();
    expect(adapter.get<{ c: number }>('SELECT COUNT(*) as c FROM files')?.c).toBe(1);
  });

  it('is a no-op when columns already exist', async () => {
    adapter.exec('ALTER TABLE files ADD COLUMN file_created_at TEXT');
    adapter.exec('ALTER TABLE files ADD COLUMN file_author TEXT');
    adapter.exec('ALTER TABLE files ADD COLUMN file_version TEXT');
    await expect(migrateAddFilesProvenanceColumns(adapter as any)).resolves.not.toThrow();
    expect(columnNames(adapter).filter(c => c === 'file_created_at')).toHaveLength(1);
  });
});
