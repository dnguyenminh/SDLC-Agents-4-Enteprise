/**
 * SA4E-41 Migration test — apply V5 on a pre-V5 (schema_version 4) database.
 * Verifies: project_id added everywhere, backfilled to legacy id, FTS still
 * returns results, counts unchanged, composite UNIQUE enforced.
 * Runs on an isolated in-memory DB (never the live index.db).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV5 } from '../migration-v5.js';

const LEGACY = 'legacy12345x';

/** Build the pre-V5 schema (no project_id anywhere). */
const PRE_V5_SCHEMA = `
CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL,
  language TEXT NOT NULL, module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')), line_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  signature TEXT, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, parent_symbol TEXT,
  visibility TEXT, doc_comment TEXT, complexity INTEGER, is_exported INTEGER DEFAULT 0
);
CREATE VIRTUAL TABLE symbols_fts USING fts5(name, signature, doc_comment, kind, content=symbols, content_rowid=id, tokenize='porter unicode61');
CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, signature, doc_comment, kind) VALUES (new.id, new.name, new.signature, new.doc_comment, new.kind);
END;
CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, root_path TEXT NOT NULL,
  language TEXT, description TEXT, file_count INTEGER NOT NULL DEFAULT 0, symbol_count INTEGER NOT NULL DEFAULT 0,
  di_style TEXT, error_handling TEXT, naming_convention TEXT, logging_framework TEXT, testing_framework TEXT, purpose TEXT
);
CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol_id INTEGER, file_id INTEGER, vector BLOB NOT NULL,
  model TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_symbol_id INTEGER NOT NULL, target_symbol TEXT NOT NULL,
  target_symbol_id INTEGER, kind TEXT NOT NULL, file_path TEXT NOT NULL, line INTEGER NOT NULL, metadata TEXT
);
CREATE TABLE body_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol_id INTEGER NOT NULL, chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding BLOB NOT NULL, token_count INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(symbol_id, chunk_index)
);
`;

function seedPreV5(adapter: SqliteAdapter): void {
  adapter.exec(PRE_V5_SCHEMA);
  adapter.exec('INSERT INTO schema_version (version) VALUES (4)');
  adapter.exec(`INSERT INTO files (id, path, relative_path, language, module, content_hash, size_bytes) VALUES
    (1, '/w/src/a.ts', 'src/a.ts', 'typescript', 'src', 'h1', 100),
    (2, '/w/src/b.ts', 'src/b.ts', 'typescript', 'src', 'h2', 200)`);
  adapter.exec(`INSERT INTO symbols (id, file_id, name, kind, signature, start_line, end_line, is_exported, complexity) VALUES
    (1, 1, 'doAuth', 'function', 'sig', 1, 5, 1, 3),
    (2, 2, 'doLogout', 'function', 'sig', 1, 5, 1, 2)`);
  adapter.exec(`INSERT INTO modules (name, root_path, language, file_count, symbol_count) VALUES ('src', 'src', 'typescript', 2, 2)`);
  adapter.exec(`INSERT INTO relationships (source_symbol_id, target_symbol, kind, file_path, line) VALUES (1, 'doLogout', 'calls', 'src/a.ts', 3)`);
  adapter.exec(`INSERT INTO body_embeddings (symbol_id, chunk_index, embedding, token_count) VALUES (1, 0, X'00', 5)`);
  adapter.exec(`INSERT INTO embeddings (symbol_id, file_id, vector, model) VALUES (1, 1, X'00', 'test')`);
}

function columnNames(adapter: SqliteAdapter, table: string): string[] {
  return adapter.all<{ name: string }>(`PRAGMA table_info(${table})`).map(r => r.name);
}

describe('SA4E-41 Migration V5', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { 
    adapter = new SqliteAdapter(':memory:'); 
    await adapter.connect(); 
    seedPreV5(adapter); 
  });
  afterEach(async () => { 
    if (adapter.isConnected()) await adapter.disconnect(); 
  });

  it('adds project_id to all code-intel tables', () => {
    applyMigrationV5(adapter as any, LEGACY);
    for (const t of ['files', 'symbols', 'modules', 'embeddings', 'relationships', 'body_embeddings']) {
      expect(columnNames(adapter, t)).toContain('project_id');
    }
  });

  it('backfills every row to the legacy project id', () => {
    applyMigrationV5(adapter as any, LEGACY);
    const distinct = (t: string) => adapter.all<{ project_id: string }>(`SELECT DISTINCT project_id FROM ${t}`);
    for (const t of ['files', 'symbols', 'modules', 'relationships', 'body_embeddings', 'embeddings']) {
      expect(distinct(t)).toEqual([{ project_id: LEGACY }]);
    }
  });

  it('preserves row counts and FTS still returns results', () => {
    applyMigrationV5(adapter as any, LEGACY);
    expect(adapter.get<{c:number}>('SELECT COUNT(*) as c FROM files')?.c).toBe(2);
    expect(adapter.get<{c:number}>('SELECT COUNT(*) as c FROM symbols')?.c).toBe(2);
    const fts = adapter.all<any>(`SELECT s.name FROM symbols_fts JOIN symbols s ON symbols_fts.rowid = s.id WHERE symbols_fts MATCH 'doAuth'`);
    expect(fts.map(r => r.name)).toContain('doAuth');
  });

  it('bumps schema_version to 5 and is idempotent', () => {
    applyMigrationV5(adapter as any, LEGACY);
    expect(adapter.get<{v:number}>('SELECT MAX(version) as v FROM schema_version')?.v).toBe(5);
    expect(() => applyMigrationV5(adapter as any, LEGACY)).not.toThrow();
    expect(adapter.get<{c:number}>('SELECT COUNT(*) as c FROM symbols')?.c).toBe(2);
  });

  it('enforces composite UNIQUE(project_id, path) on files', () => {
    applyMigrationV5(adapter as any, LEGACY);
    expect(() => adapter.run(`INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes) VALUES ('other', '/w/src/a.ts', 'src/a.ts', 'typescript', 'h', 1)`)).not.toThrow();
    expect(() => adapter.run(`INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes) VALUES (?, '/w/src/a.ts', 'src/a.ts', 'typescript', 'h', 1)`, [LEGACY])).toThrow();
  });
});
