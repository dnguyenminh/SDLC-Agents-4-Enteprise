/**
 * SA4E-41 CRITICAL isolation test — two projects with a same-relative-path file.
 * SA4E-53: Updated to use SqliteDbAdapter instead of raw Database.Database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { QueryLayer } from '../query-layer.js';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';

const PID_A = 'proj_aaaa';
const PID_B = 'proj_bbbb';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL, relative_path TEXT NOT NULL, language TEXT NOT NULL,
  module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')), line_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, path)
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, signature TEXT,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, parent_symbol TEXT,
  visibility TEXT, doc_comment TEXT
);
CREATE VIRTUAL TABLE symbols_fts USING fts5(name, signature, doc_comment, kind, content=symbols, content_rowid=id, tokenize='porter unicode61');
CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, signature, doc_comment, kind) VALUES (new.id, new.name, new.signature, new.doc_comment, new.kind);
END;
CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  root_path TEXT NOT NULL, language TEXT, description TEXT,
  file_count INTEGER NOT NULL DEFAULT 0, symbol_count INTEGER NOT NULL DEFAULT 0,
  di_style TEXT, error_handling TEXT, naming_convention TEXT, logging_framework TEXT,
  testing_framework TEXT, purpose TEXT, UNIQUE(project_id, name)
);
`;

function seedProject(db: Database.Database, pid: string, symbolName: string): void {
  const fileInfo = db.prepare(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES (?, ?, 'src/app.ts', 'typescript', 'app', ?, 100, 10)`
  ).run(pid, `/${pid}/src/app.ts`, `hash_${pid}`);
  const fileId = fileInfo.lastInsertRowid as number;
  db.prepare(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
     VALUES (?, ?, ?, 'function', 'sig', 1, 5, NULL, 'export', 'authentication logic')`
  ).run(pid, fileId, symbolName);
  db.prepare(`INSERT INTO modules (project_id, name, root_path, language, file_count, symbol_count) VALUES (?, 'app', 'app', 'typescript', 1, 1)`).run(pid);
}

describe('SA4E-41 query isolation (same relative path, two tenants)', () => {
  let db: Database.Database;
  let ql: QueryLayer;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedProject(db, PID_A, 'authenticateAlpha');
    seedProject(db, PID_B, 'authenticateBravo');
    ql = new QueryLayer(new SqliteDbAdapter(db));
  });

  afterEach(() => db.close());

  it('searchCode from B never returns A symbols', async () => {
    const resB = await ql.searchCode(PID_B, 'authentication');
    expect(resB.map(r => r.name)).toEqual(['authenticateBravo']);
    const resA = await ql.searchCode(PID_A, 'authentication');
    expect(resA.map(r => r.name)).toEqual(['authenticateAlpha']);
  });

  it('findSymbols is tenant-scoped', async () => {
    expect((await ql.findSymbols(PID_B, 'authenticate')).map(s => s.name)).toEqual(['authenticateBravo']);
    expect((await ql.findSymbols(PID_A, 'authenticate')).map(s => s.name)).toEqual(['authenticateAlpha']);
  });

  it('getFileSymbols scopes same relative path per tenant', async () => {
    const b = await ql.getFileSymbols(PID_B, 'src/app.ts');
    expect(b.map(s => s.name)).toEqual(['authenticateBravo']);
  });

  it('getIndexStatus counts exclude the other tenant', async () => {
    const status = await ql.getIndexStatus(PID_B);
    expect(status.totalFiles).toBe(1);
    expect(status.totalSymbols).toBe(1);
    expect(status.totalModules).toBe(1);
  });

  it('fail-closed: missing projectId returns nothing / zero', async () => {
    expect(await ql.searchCode(undefined, 'authentication')).toEqual([]);
    expect(await ql.findSymbols(undefined, 'authenticate')).toEqual([]);
    expect((await ql.getIndexStatus(undefined)).totalSymbols).toBe(0);
  });
});
