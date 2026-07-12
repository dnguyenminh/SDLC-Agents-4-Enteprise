/**
 * SA4E-27 — MigrationRunner Unit Tests
 * Tests the versioned schema migration system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationRunner } from '../MigrationRunner.js';

function createFreshDb(): { db: Database.Database; tmpDir: string; close: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e27-mig-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // Create the base knowledge_entries table (without project_id)
  db.exec(`
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
    tmpDir,
    close() {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe('SA4E-27 UT — MigrationRunner', () => {
  let testCtx: ReturnType<typeof createFreshDb>;

  beforeEach(() => { testCtx = createFreshDb(); });
  afterEach(() => testCtx.close());

  it('UT-MR-01: creates schema_migrations table on first run', () => {
    const runner = new MigrationRunner(testCtx.db);
    runner.run();
    const tables = testCtx.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    ).all() as any[];
    expect(tables.length).toBe(1);
  });

  it('UT-MR-02: applies migration v1 (add project_id column)', () => {
    const runner = new MigrationRunner(testCtx.db);
    const result = runner.run();
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(1);

    // Verify column exists
    const info = testCtx.db.prepare('PRAGMA table_info(knowledge_entries)').all() as any[];
    const col = info.find((c: any) => c.name === 'project_id');
    expect(col).toBeDefined();
    expect(col.type).toBe('TEXT');
  });

  it('UT-MR-03: records migration version in schema_migrations', () => {
    const runner = new MigrationRunner(testCtx.db);
    runner.run();
    const rows = testCtx.db.prepare('SELECT * FROM schema_migrations').all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('add_project_id_column');
    expect(rows[0].applied_at).toBeTruthy();
  });

  it('UT-MR-04: second run is idempotent (skips already applied)', () => {
    const runner = new MigrationRunner(testCtx.db);
    runner.run();
    const result2 = runner.run();
    expect(result2.applied).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('UT-MR-05: getAppliedVersions returns applied version numbers', () => {
    const runner = new MigrationRunner(testCtx.db);
    runner.run();
    expect(runner.getAppliedVersions()).toEqual([1]);
  });

  it('UT-MR-06: getCurrentVersion returns max applied version', () => {
    const runner = new MigrationRunner(testCtx.db);
    expect(runner.getCurrentVersion()).toBe(0);
    runner.run();
    expect(runner.getCurrentVersion()).toBe(1);
  });

  it('UT-MR-07: handles duplicate column gracefully (SA4E-26 leftover)', () => {
    // Manually add project_id column first (simulating SA4E-26)
    testCtx.db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');

    const runner = new MigrationRunner(testCtx.db);
    // Should not throw
    expect(() => runner.run()).not.toThrow();

    // Should still record as applied
    expect(runner.getAppliedVersions()).toEqual([1]);
  });

  it('UT-MR-08: creates indexes even when column already exists', () => {
    // Column already exists
    testCtx.db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');

    const runner = new MigrationRunner(testCtx.db);
    runner.run();

    const indexes = testCtx.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_entries'",
    ).all() as any[];
    const names = indexes.map((i: any) => i.name);
    expect(names).toContain('idx_ke_project_id');
    expect(names).toContain('idx_ke_scope_project');
  });

  it('UT-MR-09: downgrade detection logs warning but continues', () => {
    const runner = new MigrationRunner(testCtx.db);
    runner.run();

    // Simulate a future migration recorded manually
    testCtx.db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(99, 'future_migration', new Date().toISOString());

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runner2 = new MigrationRunner(testCtx.db);
    expect(() => runner2.run()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('DB version (99) ahead of code (1)'),
    );
    warnSpy.mockRestore();
  });

  it('UT-MR-10: getAppliedVersions returns empty array when table does not exist', () => {
    // Use a fresh DB without running ensureTrackingTable
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e27-fresh-'));
    const db2 = new Database(path.join(tmpDir2, 'fresh.db'));
    db2.exec('CREATE TABLE knowledge_entries (id INTEGER PRIMARY KEY, content TEXT)');

    const runner = new MigrationRunner(db2);
    expect(runner.getAppliedVersions()).toEqual([]);

    db2.close();
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });
});
