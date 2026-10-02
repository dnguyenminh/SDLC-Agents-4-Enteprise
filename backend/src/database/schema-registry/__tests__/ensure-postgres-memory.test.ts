/**
 * Unit tests for the PostgreSQL memory-schema ensure (SA4E-335 DEF-002):
 * statement splitting, sqlite→postgres DDL translation, engine guards and the
 * guarantee that every canonical table is applied in postgres dialect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../adapters/DatabaseAdapter.js';
import { MEMORY_SCHEMA } from '../../../modules/memory/schema/index.js';
import { splitStatements, toPostgresDdl, ensurePostgresMemorySchema } from '../ensure-postgres-memory.js';

const execAsync = vi.fn();
let adapter: DatabaseAdapter;

function canonicalTables(): string[] {
  return [...MEMORY_SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
}

beforeEach(() => {
  execAsync.mockReset().mockResolvedValue(undefined);
  adapter = {
    getEngine: () => 'postgresql',
    isConnected: () => true,
    execAsync,
  } as unknown as DatabaseAdapter;
});

const executed = () => execAsync.mock.calls.map((c) => c[0] as string);

describe('splitStatements', () => {
  it('splits on semicolons and strips leading comments', () => {
    const parts = splitStatements(`-- heading\nCREATE TABLE t (a TEXT);\nCREATE INDEX i ON t(a);`);
    expect(parts).toEqual(['CREATE TABLE t (a TEXT)', 'CREATE INDEX i ON t(a)']);
  });

  it('never emits a fragment that starts with a comment', () => {
    expect(splitStatements(MEMORY_SCHEMA).every((s) => !s.startsWith('--'))).toBe(true);
  });
});

describe('toPostgresDdl', () => {
  it('translates sqlite idioms to postgres', () => {
    const ddl = toPostgresDdl(`CREATE TABLE t (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight REAL NOT NULL DEFAULT 1.0,
      vector BLOB,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    expect(ddl).toContain('SERIAL PRIMARY KEY');
    expect(ddl).toContain('DOUBLE PRECISION');
    expect(ddl).toContain('BYTEA');
    expect(ddl).toContain("DEFAULT (NOW()::TEXT)");
    expect(ddl).not.toContain('AUTOINCREMENT');
    expect(ddl).not.toContain("datetime('now')");
    expect(ddl).not.toContain('DEFAULT NOW()'); // timestamptz default would be rejected for TEXT columns
  });
});

describe('ensurePostgresMemorySchema', () => {
  it('is a no-op on non-postgres engines and when disconnected', async () => {
    const sqlite = { getEngine: () => 'sqlite', isConnected: () => true, execAsync } as unknown as DatabaseAdapter;
    await ensurePostgresMemorySchema(sqlite);
    expect(execAsync).not.toHaveBeenCalled();

    const down = { getEngine: () => 'postgresql', isConnected: () => false, execAsync } as unknown as DatabaseAdapter;
    await ensurePostgresMemorySchema(down);
    expect(execAsync).not.toHaveBeenCalled();
  });

  it('applies every canonical memory table in postgres dialect', async () => {
    await ensurePostgresMemorySchema(adapter);
    const sql = executed();
    expect(sql.length).toBeGreaterThan(canonicalTables().length);
    for (const table of canonicalTables()) {
      expect(sql.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${table} `))).toBe(true);
    }
    const all = sql.join('\n');
    expect(all).not.toContain('AUTOINCREMENT');
    expect(all).not.toContain("datetime('now')");
    expect(all).not.toContain('fts5');
    expect(all).not.toContain('CREATE TRIGGER');
    expect(all).not.toContain('VIRTUAL TABLE');
  });

  it('creates the knowledge_entries indexes from the canonical schema', async () => {
    await ensurePostgresMemorySchema(adapter);
    expect(executed().some((s) => s.includes('CREATE INDEX IF NOT EXISTS idx_ke_tier'))).toBe(true);
    expect(executed().some((s) => s.includes('CREATE INDEX IF NOT EXISTS idx_ke_project_id'))).toBe(true);
  });

  it('swallows individual statement failures (idempotent re-runs)', async () => {
    execAsync.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensurePostgresMemorySchema(adapter)).resolves.toBeUndefined();
    expect(execAsync.mock.calls.length).toBeGreaterThan(1);
  });
});
