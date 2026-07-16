/**
 * SA4E-42 UT-11..19 — McpToolsRepository scoped SQL over a real better-sqlite3 DB.
 * Covers upsert idempotency, scoped prune/delete, empty-set guard, F-01 collision,
 * F-04 large-set fallback, and F-06 parameterized prune.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import type Database from 'better-sqlite3';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';
import { McpToolsRepository } from '../McpToolsRepository.js';
import type { PreparedTool } from '../models/PreparedTool.js';

const silent = pino({ level: 'silent' });

function prepared(name: string, server: string, description = `${name} d`): PreparedTool {
  return {
    name,
    description,
    schemaJson: JSON.stringify({ type: 'object' }),
    category: server,
    server,
    vector: Buffer.from(new Float32Array([1, 2, 3, 4]).buffer),
  };
}

function names(db: Database.Database, server: string): string[] {
  return (db.prepare('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name').all(server) as { name: string }[])
    .map((r) => r.name);
}

describe('McpToolsRepository', () => {
  let tmp: TempDb;
  let db: Database.Database;
  let repo: McpToolsRepository;

  beforeEach(() => {
    tmp = makeTempDb();
    db = tmp.dbManager.getDb();
    repo = new McpToolsRepository(db, silent);
  });
  afterEach(() => tmp.close());

  it('UT-11: upsertScoped inserts rows with server/category/vector', () => {
    const count = repo.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S')], 'S');
    expect(count).toBe(2);
    const row = db.prepare('SELECT * FROM mcp_tools WHERE name = ?').get('t1') as any;
    expect(row.server).toBe('S');
    expect(row.category).toBe('S');
    expect(row.vector).toBeInstanceOf(Buffer);
  });

  it('UT-12: repeated upsert updates in place (no duplicate)', () => {
    repo.upsertScoped([prepared('t1', 'S', 'old')], 'S');
    repo.upsertScoped([prepared('t1', 'S', 'new')], 'S');
    const rows = db.prepare('SELECT * FROM mcp_tools WHERE name = ?').all('t1') as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('new');
  });

  it('UT-13: pruneRemoved deletes rows not in the current set', () => {
    repo.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S'), prepared('t3', 'S')], 'S');
    const removed = repo.pruneRemoved('S', ['t1', 't2']);
    expect(removed).toBe(1);
    expect(names(db, 'S')).toEqual(['t1', 't2']);
  });

  it('UT-14: pruneRemoved with empty set is skipped (no wipe) + warns', () => {
    const warn = vi.fn();
    const r = new McpToolsRepository(db, { warn } as any);
    r.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S')], 'S');
    const removed = r.pruneRemoved('S', []);
    expect(removed).toBe(0);
    expect(names(db, 'S')).toEqual(['t1', 't2']);
    expect(warn).toHaveBeenCalled();
  });

  it('UT-15: deleteByServer removes only that server (core + others untouched)', () => {
    repo.upsertScoped([prepared('s1', 'S')], 'S');
    repo.upsertScoped([prepared('t1', 'T')], 'T');
    db.prepare('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)')
      .run('core', 'core', '{}', 'memory', null, null);
    repo.deleteByServer('S');
    expect(names(db, 'S')).toEqual([]);
    expect(names(db, 'T')).toEqual(['t1']);
    const core = db.prepare('SELECT COUNT(*) c FROM mcp_tools WHERE server IS NULL').get() as any;
    expect(core.c).toBe(1);
  });

  it('UT-16: deleteByServer for unknown server returns 0 (no error)', () => {
    expect(repo.deleteByServer('nope')).toBe(0);
  });

  it('UT-17: prune with >900 tools uses temp-table fallback (no bound-var error)', () => {
    const big = Array.from({ length: 1200 }, (_, i) => prepared(`t${i}`, 'S'));
    repo.upsertScoped(big, 'S');
    const keep = big.slice(0, 1000).map((t) => t.name);
    const removed = repo.pruneRemoved('S', keep);
    expect(removed).toBe(200);
    expect(names(db, 'S')).toHaveLength(1000);
  });

  it('UT-18: scope-aware upsert does not hijack another server row (F-01)', () => {
    const warn = vi.fn();
    const r = new McpToolsRepository(db, { warn } as any);
    r.upsertScoped([prepared('common', 'A')], 'A');
    const upserted = r.upsertScoped([prepared('common', 'B')], 'B');
    expect(upserted).toBe(0);
    const row = db.prepare('SELECT server FROM mcp_tools WHERE name = ?').get('common') as any;
    expect(row.server).toBe('A');
    expect(warn).toHaveBeenCalled();
  });

  it('UT-19: prune SQL contains only ? placeholders (F-06)', () => {
    const sql = repo.buildPruneSql(3);
    expect(sql).toContain('NOT IN (?,?,?)');
    expect(sql).not.toMatch(/'/);
  });
});
