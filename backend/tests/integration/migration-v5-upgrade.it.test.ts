/**
 * SA4E-42 PT-01 regression — upgrading an EXISTING schema_version=5 database
 * (the state SA4E-41 leaves behind) must still add the additive `mcp_tools.server`
 * column + `idx_mcp_tools_server` index.
 *
 * The defect: runMigrations() had an early-return `if (pending.length === 0 &&
 * current >= 5) return;` placed BEFORE migrateAddMcpToolsServerColumn(db), so on
 * an already-migrated (v5) install the additive migration was unreachable and
 * startup crashed with `SqliteError: no such column: server`.
 *
 * This test seeds a v5 DB WITHOUT the `server` column, runs the full
 * runMigrations() entry point, and asserts the column + index exist.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getCurrentVersion } from '../../src/engine/db/migrations.js';

/** Build a minimal DB pre-seeded at schema_version=5 with a legacy mcp_tools (no `server`). */
function seedV5DbWithoutServerColumn(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Legacy mcp_tools shape as left by pre-SA4E-42 installs — NO `server` column.
  db.exec(`CREATE TABLE mcp_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    schema_json TEXT NOT NULL,
    category TEXT,
    vector BLOB
  )`);
  db.prepare('INSERT INTO mcp_tools (name, description, schema_json, category) VALUES (?,?,?,?)')
    .run('mem_search', 'core tool', '{}', 'memory');
  // Mark the DB as fully migrated to v5 (SA4E-41 end-state).
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(5);
  return db;
}

function columns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).map((r) => r.name);
}

describe('SA4E-42 PT-01 — v5 upgrade path adds mcp_tools.server', () => {
  it('BUG-SA4E-42: runMigrations on an existing v5 DB adds server column + index', () => {
    const db = seedV5DbWithoutServerColumn();
    try {
      expect(getCurrentVersion(db)).toBe(5); // precondition: already at v5
      expect(columns(db, 'mcp_tools')).not.toContain('server'); // precondition: legacy shape

      runMigrations(db); // full entry point — must NOT early-return past the additive migration

      // The additive `server` column must now exist (else startup INSERT crashes).
      expect(columns(db, 'mcp_tools')).toContain('server');
      // The scoped-delete index must exist.
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_mcp_tools_server'")
        .get();
      expect(idx).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('BUG-SA4E-42: startup-style scoped INSERT succeeds after v5 upgrade', () => {
    const db = seedV5DbWithoutServerColumn();
    try {
      runMigrations(db);
      // Mirrors index.ts tool ingest — this is the statement that crashed pre-fix.
      expect(() =>
        db
          .prepare(
            'INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)',
          )
          .run('jira_search', 'proxied', '{}', 'atlassian', 'atlassian', null),
      ).not.toThrow();
      const row = db.prepare('SELECT server FROM mcp_tools WHERE name = ?').get('jira_search') as any;
      expect(row.server).toBe('atlassian');
    } finally {
      db.close();
    }
  });
});
