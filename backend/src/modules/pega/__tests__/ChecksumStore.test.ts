/**
 * SA4E-241 — ChecksumStore unit/integration tests (real SQLite :memory:).
 * Covers IC-03/IC-04/SEC-10: findExisting returns only checksums in the given
 * project, never computes a checksum, and isolates by project.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { ChecksumStore } from '../ChecksumStore.js';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, path TEXT, relative_path TEXT, language TEXT, module TEXT,
  content_hash TEXT, size_bytes INTEGER, line_count INTEGER,
  UNIQUE(project_id, path)
);
`;

/** 64-hex sha256-shaped fixtures. */
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);
/** 40-hex git-blob-shaped fixture. */
const G1 = 'd'.repeat(40);

async function seed(adapter: SqliteAdapter, projectId: string, hash: string, n: number): Promise<void> {
  await adapter.runAsync(
    'INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes, line_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, `/p/${projectId}/${n}`, `${n}.ts`, 'typescript', hash, 10, 1],
  );
}

describe('ChecksumStore (SA4E-241)', () => {
  let adapter: SqliteAdapter;
  let store: ChecksumStore;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.execAsync(SCHEMA);
    store = new ChecksumStore(adapter);
  });

  afterEach(async () => { await adapter.disconnect(); });

  it('IC-03: returns the subset of checksums that exist in the project', async () => {
    await seed(adapter, 'P1', H1, 1);
    await seed(adapter, 'P1', H2, 2);
    const existing = await store.findExisting('P1', [H1, H2, H3]);
    expect(existing.sort()).toEqual([H1, H2].sort());
    expect(existing).not.toContain(H3);
  });

  it('returns [] when no checksums match', async () => {
    await seed(adapter, 'P1', H1, 1);
    expect(await store.findExisting('P1', [H3])).toEqual([]);
  });

  it('returns [] for empty input without querying', async () => {
    expect(await store.findExisting('P1', [])).toEqual([]);
  });

  it('returns [] when projectId is empty (fail-closed scope)', async () => {
    await seed(adapter, 'P1', H1, 1);
    expect(await store.findExisting('', [H1])).toEqual([]);
  });

  it('SEC-10: isolates by project — same checksum in another project is not returned', async () => {
    // H1 exists in BOTH P1 and OtherProj; H3 only in OtherProj.
    await seed(adapter, 'PegaCollProj', H1, 1);
    await seed(adapter, 'OtherProj', H1, 1);
    await seed(adapter, 'OtherProj', H3, 2);
    const existing = await store.findExisting('PegaCollProj', [H1, H3]);
    expect(existing).toEqual([H1]);
    expect(existing).not.toContain(H3);
  });

  it('supports both 40-hex (git blob) and 64-hex (sha256) checksums (NT-5, one column)', async () => {
    await seed(adapter, 'P1', G1, 1);
    await seed(adapter, 'P1', H1, 2);
    const existing = await store.findExisting('P1', [G1, H1, H2]);
    expect(existing.sort()).toEqual([G1, H1].sort());
  });

  it('handles > QUERY_BATCH checksums by chunking', async () => {
    // Seed 950 distinct checksums, query 1000 (950 existing + 50 missing).
    const seeded: string[] = [];
    for (let i = 0; i < 950; i++) {
      const h = i.toString(16).padStart(64, '0');
      seeded.push(h);
      await seed(adapter, 'P1', h, i);
    }
    const missing = Array.from({ length: 50 }, (_, i) => (i + 100000).toString(16).padStart(64, '0'));
    const existing = await store.findExisting('P1', [...seeded, ...missing]);
    expect(existing.length).toBe(950);
    for (const m of missing) { expect(existing).not.toContain(m); }
  });
});
