/**
 * updateModules regression test — a module holding files in two languages
 * used to violate UNIQUE(project_id, name) because the query grouped by
 * (module, language) but INSERTed one row per group into a name-unique table.
 * Runs on an isolated in-memory DB (never the live index.db).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { updateModules } from '../module-helper.js';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL, relative_path TEXT NOT NULL, language TEXT NOT NULL,
  module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')), line_count INTEGER NOT NULL DEFAULT 0,
  file_created_at TEXT, file_author TEXT, file_version TEXT,
  UNIQUE(project_id, path)
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  signature TEXT, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL
);
CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL, root_path TEXT NOT NULL, language TEXT,
  file_count INTEGER NOT NULL DEFAULT 0, symbol_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, name)
);`;

function seedBilingual(adapter: SqliteAdapter): void {
  adapter.exec(`INSERT INTO files (id, project_id, path, relative_path, language, module, content_hash, size_bytes) VALUES
    (1, 'p1', '/w/a.ts', 'a.ts', 'typescript', 'mixed', 'h1', 100),
    (2, 'p1', '/w/b.py', 'b.py', 'python', 'mixed', 'h2', 200),
    (3, 'p1', '/w/sub/c.ts', 'sub/c.ts', 'typescript', 'sub', 'h3', 50)`);
  adapter.exec(`INSERT INTO symbols (file_id, project_id, name, kind, start_line, end_line) VALUES
    (1, 'p1', 'fa', 'function', 1, 5),
    (1, 'p1', 'fb', 'function', 6, 9),
    (2, 'p1', 'fc', 'function', 1, 3)`);
}

describe('updateModules bilingual merge', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(SCHEMA);
    seedBilingual(adapter);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('merges language variants into one row per module (no UNIQUE throw)', async () => {
    await expect(updateModules(adapter as any, 'p1')).resolves.not.toThrow();
    const rows = adapter.all<{ name: string; file_count: number; symbol_count: number }>(
      `SELECT name, file_count, symbol_count FROM modules WHERE project_id = 'p1' ORDER BY name`);
    expect(rows.map(r => r.name)).toEqual(['mixed', 'sub']);
    expect(rows.find(r => r.name === 'mixed')).toMatchObject({ file_count: 2, symbol_count: 3 });
    expect(rows.find(r => r.name === 'sub')).toMatchObject({ file_count: 1, symbol_count: 0 });
  });

  it('picks the language owning the most files', async () => {
    adapter.exec(`INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes) VALUES
      ('p1', '/w/d.py', 'd.py', 'python', 'mixed', 'h4', 60)`);
    await updateModules(adapter as any, 'p1');
    const row = adapter.get<{ language: string; file_count: number }>(
      `SELECT language, file_count FROM modules WHERE project_id = 'p1' AND name = 'mixed'`);
    expect(row).toMatchObject({ language: 'python', file_count: 3 });
  });

  it('leaves other tenants untouched', async () => {
    adapter.exec(`INSERT INTO modules (project_id, name, root_path, language, file_count, symbol_count) VALUES
      ('p2', 'keep', 'keep', 'go', 7, 7)`);
    await updateModules(adapter as any, 'p1');
    const row = adapter.get<{ file_count: number }>(`SELECT file_count FROM modules WHERE project_id = 'p2'`);
    expect(row?.file_count).toBe(7);
  });
});

describe('updateModules PG int8-as-string coercion (22003 regression)', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(SCHEMA);
    seedBilingual(adapter);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('coerces stringified COUNT(*) before summing (no string-concat)', async () => {
    // mixed: files 1(ts)+2(py)=2 → add a third (py) so merge has 2 rows to sum.
    adapter.exec(`INSERT INTO files (id, project_id, path, relative_path, language, module, content_hash, size_bytes) VALUES
      (4, 'p1', '/w/d.py', 'd.py', 'python', 'mixed', 'h4', 60)`);
    // Simulate node-pg: COUNT(*) (int8) arrives as a STRING on PostgreSQL.
    const pgStringAdapter = new Proxy(adapter, {
      get(target, prop, recv) {
        const value = Reflect.get(target, prop, recv);
        if (prop === 'allAsync' && typeof value === 'function') {
          return async (...args: unknown[]) => {
            const rows = (await value.apply(target, args)) as Record<string, unknown>[];
            return rows.map(r => ({ ...r, file_count: String(r.file_count), symbol_count: String(r.symbol_count) }));
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await updateModules(pgStringAdapter as any, 'p1');
    const row = adapter.get<{ file_count: number; symbol_count: number }>(
      `SELECT file_count, symbol_count FROM modules WHERE project_id = 'p1' AND name = 'mixed'`);
    // Without Number(): "1" + "2" = "12" → INSERT 12 (PG 22003 out-of-range on bigint sums).
    expect(row?.file_count).toBe(3);
    expect(row?.symbol_count).toBe(3);
  });
});
