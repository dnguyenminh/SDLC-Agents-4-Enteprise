/**
 * SA4E-27 — MigrationRunner Unit Tests
 * Tests the versioned schema migration system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MigrationRunner } from '../MigrationRunner.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';

async function createFreshDb(): Promise<{ db: SqliteAdapter; close: () => Promise<void> }> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      type TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'WORKING',
      scope TEXT NOT NULL DEFAULT 'USER',
      user_id TEXT DEFAULT NULL,
      source TEXT,
      source_ref TEXT,
      tags TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 1.0,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT,
      expires_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER NOT NULL DEFAULT 0,
      structured_map TEXT NOT NULL DEFAULT '{}',
      quality_score INTEGER DEFAULT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      agent_name TEXT DEFAULT NULL,
      owner TEXT DEFAULT NULL
    )
  `);
  return {
    db,
    close: async () => { await db.disconnect(); },
  };
}

describe('SA4E-27 UT — MigrationRunner', () => {
  let testCtx: Awaited<ReturnType<typeof createFreshDb>>;

  beforeEach(async () => { testCtx = await createFreshDb(); });
  afterEach(async () => { await testCtx.close(); });

  it('UT-MR-01: creates schema_migrations table on first run', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    const tables = await testCtx.db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    ) as any[];
    expect(tables.length).toBe(1);
  });

  it('UT-MR-02: applies migration v1 (add project_id column)', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    const result = runner.run();
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(2);

    const info = await testCtx.db.all('PRAGMA table_info(knowledge_entries)') as any[];
    const col = info.find((c: any) => c.name === 'project_id');
    expect(col).toBeDefined();
    expect(col.type).toBe('TEXT');
  });

  it('UT-MR-03: records migration version in schema_migrations', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    const rows = await testCtx.db.all('SELECT * FROM schema_migrations ORDER BY version') as any[];
    expect(rows.length).toBe(2);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('add_project_id_column');
    expect(rows[1].version).toBe(2);
    expect(rows[1].name).toBe('add_workspace_id_column');
  });

  it('UT-MR-04: second run is idempotent (skips already applied)', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    const result2 = runner.run();
    expect(result2.applied).toBe(0);
    expect(result2.skipped).toBe(2);
  });

  it('UT-MR-05: getAppliedVersions returns applied version numbers', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    expect(runner.getAppliedVersions()).toEqual([1, 2]);
  });

  it('UT-MR-06: getCurrentVersion returns max applied version', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    expect(runner.getCurrentVersion()).toBe(0);
    runner.run();
    expect(runner.getCurrentVersion()).toBe(2);
  });

  it('UT-MR-07: handles duplicate column gracefully (SA4E-26 leftover)', async () => {
    await testCtx.db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    expect(() => runner.run()).not.toThrow();
    expect(runner.getAppliedVersions()).toEqual([1, 2]);
  });

  it('UT-MR-08: creates indexes even when column already exists', async () => {
    await testCtx.db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    const indexes = await testCtx.db.all(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_entries'",
    ) as any[];
    const names = indexes.map((i: any) => i.name);
    expect(names).toContain('idx_ke_project_id');
    expect(names).toContain('idx_ke_scope_project');
  });

  it('UT-MR-09: downgrade detection logs warning but continues', async () => {
    const runner = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    runner.run();
    await testCtx.db.run(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      [99, 'future_migration', new Date().toISOString()],
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runner2 = new MigrationRunner(new SqliteDbAdapter(testCtx.db as any));
    expect(() => runner2.run()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('DB version (99) ahead of code (2)'),
    );
    warnSpy.mockRestore();
  });

  it('UT-MR-10: getAppliedVersions returns empty array when table does not exist', async () => {
    const db2 = new SqliteAdapter(':memory:');
    await db2.connect();
    await db2.exec('CREATE TABLE knowledge_entries (id INTEGER PRIMARY KEY, content TEXT)');
    const runner = new MigrationRunner(new SqliteDbAdapter(db2 as any));
    expect(runner.getAppliedVersions()).toEqual([]);
    await db2.disconnect();
  });
});
