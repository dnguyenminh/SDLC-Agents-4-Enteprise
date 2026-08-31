/**
 * Unit tests for FileChecksumRepository — tenant-scoped checksum persistence,
 * batch preload, upsert (SQLite INSERT OR REPLACE), and chunked deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FileChecksumRepository } from '../FileChecksumRepository.js';
import { makeTestAdapter } from '../../__tests__/test-adapter.js';

const SCHEMA = `
CREATE TABLE file_checksums (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  file_path        TEXT NOT NULL,
  file_checksum    TEXT NOT NULL,
  last_indexed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checksums_tenant_file
  ON file_checksums (user_id, project_id, file_path);
`;

let db: Database.Database;
let repo: FileChecksumRepository;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  repo = new FileChecksumRepository(makeTestAdapter(db));
});

afterEach(() => db.close());

describe('FileChecksumRepository', () => {
  it('loadAll returns tenant-scoped path->checksum map', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'b.ts', file_checksum: 'cb' });
    // Different tenant should not leak in.
    await repo.upsert({ user_id: 'u2', project_id: 'p1', file_path: 'a.ts', file_checksum: 'cz' });
    const map = await repo.loadAll('u1', 'p1');
    expect(map.size).toBe(2);
    expect(map.get('a.ts')).toBe('ca');
    expect(map.get('b.ts')).toBe('cb');
  });

  it('upsert inserts a new row (sqlite engine)', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    const row = db.prepare('SELECT * FROM file_checksums').get() as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.file_path).toBe('a.ts');
    expect(row.file_checksum).toBe('ca');
    expect(row.id).toBeTruthy();
  });

  it('upsert replaces existing checksum for same tenant+path (idempotent)', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'cb' });
    const rows = db.prepare('SELECT * FROM file_checksums').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].file_checksum).toBe('cb');
  });

  it('deleteNotIn removes only paths outside the keep-set for the tenant', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'b.ts', file_checksum: 'cb' });
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'c.ts', file_checksum: 'cc' });
    await repo.upsert({ user_id: 'u2', project_id: 'p1', file_path: 'a.ts', file_checksum: 'cz' });
    const n = await repo.deleteNotIn('u1', 'p1', ['a.ts', 'c.ts']);
    expect(n).toBe(1); // only b.ts removed
    const remaining = db.prepare('SELECT file_path FROM file_checksums WHERE user_id=? AND project_id=?')
      .all('u1', 'p1') as Record<string, unknown>[];
    expect(remaining.map((r) => r.file_path).sort()).toEqual(['a.ts', 'c.ts']);
    // other tenant untouched
    const other = db.prepare('SELECT file_path FROM file_checksums WHERE user_id=?').all('u2') as Record<string, unknown>[];
    expect(other).toHaveLength(1);
  });

  it('deleteNotIn with empty currentPaths wipes tenant checksums', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    await repo.upsert({ user_id: 'u2', project_id: 'p1', file_path: 'a.ts', file_checksum: 'cz' });
    const n = await repo.deleteNotIn('u1', 'p1', []);
    expect(n).toBe(1);
    const u1 = db.prepare('SELECT COUNT(*) AS c FROM file_checksums WHERE user_id=?').get('u1') as Record<string, unknown>;
    expect(u1.c).toBe(0);
    const u2 = db.prepare('SELECT COUNT(*) AS c FROM file_checksums WHERE user_id=?').get('u2') as Record<string, unknown>;
    expect(u2.c).toBe(1);
  });

  it('deleteAll removes every checksum for the tenant', async () => {
    await repo.upsert({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'ca' });
    await repo.upsert({ user_id: 'u2', project_id: 'p1', file_path: 'a.ts', file_checksum: 'cz' });
    const n = await repo.deleteAll('u1', 'p1');
    expect(n).toBe(1);
    const u1 = db.prepare('SELECT COUNT(*) AS c FROM file_checksums WHERE user_id=?').get('u1') as Record<string, unknown>;
    expect(u1.c).toBe(0);
  });
});
