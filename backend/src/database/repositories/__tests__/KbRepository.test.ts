/**
 * Unit tests for KbRepository — scoped entry counts, paginated retrieval,
 * sort allowlisting and legacy fallback counting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { KbRepository } from '../KbRepository.js';

const SCHEMA = `
CREATE TABLE knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, summary TEXT NOT NULL, type TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'WORKING', scope TEXT NOT NULL DEFAULT 'USER', user_id TEXT DEFAULT NULL,
  project_id TEXT DEFAULT NULL, source TEXT, source_ref TEXT, tags TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0, access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  quality_score INTEGER DEFAULT NULL, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE kb_shared_grants (
  project_id TEXT PRIMARY KEY, granted_by TEXT DEFAULT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let adapter: SqliteAdapter;
let repo: KbRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  const insertSQL = `INSERT INTO knowledge_entries
    (id, content, summary, type, scope, user_id, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  adapter.run(insertSQL, [1, 'c1', 'a', 'note', 'PROJECT', null, 'p1', '2024-01-01 00:00:00']);
  adapter.run(insertSQL, [2, 'c2', 'b', 'note', 'PROJECT', null, 'p1', '2024-01-02 00:00:00']);
  adapter.run(insertSQL, [3, 'c3', 'c', 'note', 'USER', 'u1', 'p1', '2024-01-03 00:00:00']);
  adapter.run(insertSQL, [4, 'c4', 'd', 'note', 'PROJECT', null, 'other', '2024-01-04 00:00:00']);
  adapter.run(insertSQL, [5, 'c5', 'e', 'note', 'SHARED', null, null, '2024-01-05 00:00:00']);
  adapter.run("INSERT INTO kb_shared_grants (project_id, granted_by) VALUES (?, ?)", ['p1', 'u1']);
  repo = new KbRepository(adapter);
});

afterEach(async () => {
  await adapter.disconnect();
});

describe('KbRepository', () => {
  it('getEntryCount counts all entries for the default scope', () => {
    expect(repo.getEntryCount('default')).toBe(5);
  });

  it('getEntryCount scopes to a project including shared grants', () => {
    expect(repo.getEntryCount('p1')).toBe(3);
  });

  it('getEntryCount narrows further when a user is given', () => {
    expect(repo.getEntryCount('p1', 'u1')).toBe(4);
  });

  it('getEntryCount falls back to legacy null-project rows', () => {
    expect(repo.getEntryCount('ghost')).toBe(1);
  });

  it('getEntries paginates and sorts within project scope', () => {
    const page1 = repo.getEntries(1, 2, 'created_at', 'desc', 'p1');
    expect(page1.total).toBe(3);
    expect(page1.items.map((r) => r.id)).toEqual([5, 2]);
    const page2 = repo.getEntries(2, 2, 'created_at', 'desc', 'p1');
    expect(page2.items.map((r) => r.id)).toEqual([1]);
  });

  it('getEntries returns all entries sorted ascending for default scope', () => {
    const result = repo.getEntries(1, 5, 'created_at', 'asc', 'default');
    expect(result.total).toBe(5);
    expect(result.items.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('getEntries applies the user scope filter', () => {
    const result = repo.getEntries(1, 10, 'created_at', 'asc', 'p1', 'u1');
    expect(result.total).toBe(4);
    expect(result.items.map((r) => r.id)).toEqual([1, 2, 3, 5]);
  });

  it('getEntries falls back to created_at for invalid sort columns', () => {
    const result = repo.getEntries(1, 5, "summary; DROP TABLE", 'asc', 'default');
    expect(result.items.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(adapter.get("SELECT name FROM sqlite_master WHERE name = 'knowledge_entries'")).toBeDefined();
  });

  it('getEntries treats any non-asc sort order as descending', () => {
    const result = repo.getEntries(1, 5, 'created_at', 'sideways', 'default');
    expect(result.items.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });
});