/**
 * SA4E-42 UT-11..19 — McpToolsRepository scoped SQL over a real better-sqlite3 DB.
 * Covers upsert idempotency, scoped prune/delete, empty-set guard, F-01 collision,
 * F-04 large-set fallback, and F-06 parameterized prune.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SCHEMA_V1 } from '../../../../engine/db/schema.js';
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

function names(adapter: SqliteAdapter, server: string): string[] {
  return (adapter.all<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name', [server]))
    .map((r) => r.name);
}

describe('McpToolsRepository', () => {
  let adapter: SqliteAdapter;
  let repo: McpToolsRepository;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA_V1);
    repo = new McpToolsRepository(adapter, silent);
  });
  afterEach(async () => {
    await adapter.disconnect();
  });

  it('UT-11: upsertScoped inserts rows with server/category/vector', async () => {
    const count = await repo.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S')], 'S');
    expect(count).toBe(2);
    const row = await adapter.get('SELECT * FROM mcp_tools WHERE name = ?', ['t1']) as any;
    expect(row.server).toBe('S');
    expect(row.category).toBe('S');
    expect(row.vector).toBeInstanceOf(Uint8Array);
  });

  it('UT-12: repeated upsert updates in place (no duplicate)', async () => {
    await repo.upsertScoped([prepared('t1', 'S', 'old')], 'S');
    await repo.upsertScoped([prepared('t1', 'S', 'new')], 'S');
    const rows = await adapter.all('SELECT * FROM mcp_tools WHERE name = ?', ['t1']) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('new');
  });

  it('UT-13: pruneRemoved deletes rows not in the current set', async () => {
    await repo.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S'), prepared('t3', 'S')], 'S');
    const removed = await repo.pruneRemoved('S', ['t1', 't2']);
    expect(removed).toBe(1);
    expect(names(adapter, 'S')).toEqual(['t1', 't2']);
  });

  it('UT-14: pruneRemoved with empty set is skipped (no wipe) + warns', async () => {
    const warn = vi.fn();
    const r = new McpToolsRepository(adapter, { warn } as any);
    await r.upsertScoped([prepared('t1', 'S'), prepared('t2', 'S')], 'S');
    const removed = await r.pruneRemoved('S', []);
    expect(removed).toBe(0);
    expect(names(adapter, 'S')).toEqual(['t1', 't2']);
    expect(warn).toHaveBeenCalled();
  });

  it('UT-15: deleteByServer removes only that server (core + others untouched)', async () => {
    await repo.upsertScoped([prepared('s1', 'S')], 'S');
    await repo.upsertScoped([prepared('t1', 'T')], 'T');
    await adapter.run('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)', ['core', 'core', '{}', 'memory', null, null]);
    await repo.deleteByServer('S');
    expect(names(adapter, 'S')).toEqual([]);
    expect(names(adapter, 'T')).toEqual(['t1']);
    const core = await adapter.get('SELECT COUNT(*) c FROM mcp_tools WHERE server IS NULL') as any;
    expect(core.c).toBe(1);
  });

  it('UT-16: deleteByServer for unknown server returns 0 (no error)', async () => {
    expect(await repo.deleteByServer('nope')).toBe(0);
  });

  it('UT-17: prune with >900 tools uses temp-table fallback (no bound-var error)', async () => {
    const big = Array.from({ length: 1200 }, (_, i) => prepared(`t${i}`, 'S'));
    await repo.upsertScoped(big, 'S');
    const keep = big.slice(0, 1000).map((t) => t.name);
    const removed = await repo.pruneRemoved('S', keep);
    expect(removed).toBe(200);
    expect(names(adapter, 'S')).toHaveLength(1000);
  });

  it('UT-18: scope-aware upsert does not hijack another server row (F-01)', async () => {
    const warn = vi.fn();
    const r = new McpToolsRepository(adapter, { warn } as any);
    await r.upsertScoped([prepared('common', 'A')], 'A');
    const upserted = await r.upsertScoped([prepared('common', 'B')], 'B');
    expect(upserted).toBe(0);
    const row = await adapter.get('SELECT server FROM mcp_tools WHERE name = ?', ['common']) as any;
    expect(row.server).toBe('A');
    expect(warn).toHaveBeenCalled();
  });

  it('UT-19: prune SQL contains only ? placeholders (F-06)', () => {
    const sql = repo.buildPruneSql(3);
    expect(sql).toContain('NOT IN (?,?,?)');
    expect(sql).not.toMatch(/'/);
  });
});
