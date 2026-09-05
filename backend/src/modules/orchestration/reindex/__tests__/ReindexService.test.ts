/**
 * SA4E-42 UT-28..32 — ReindexService: scoped selection, empty no-op, embed
 * skip-on-fail, latest-state guard, and fail-soft write (IR-3/4/7/9, BR-06).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SCHEMA_V1 } from '../../../../engine/db/schema.js';
import { ReindexService } from '../ReindexService.js';
import { FakeEmbedder, FakeToolSource } from './reindex-fakes.js';

const silent = pino({ level: 'silent' });

function countFor(adapter: SqliteAdapter, server: string): Promise<number> {
  return Promise.resolve(adapter.get<{ c: number }>('SELECT COUNT(*) c FROM mcp_tools WHERE server = ?', [server])?.c ?? 0);
}

describe('ReindexService', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA_V1);
  });
  afterEach(async () => {
    await adapter.disconnect();
  });

  it('UT-28: only tools with category === server are upserted', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['a', 'b']);
    src.setTools('T', ['c']);
    src.setConnected('S', true);
    const svc = new ReindexService(() => adapter, new FakeEmbedder(), src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(2);
    expect(await countFor(adapter, 'S')).toBe(2);
    expect(await countFor(adapter, 'T')).toBe(0);
  });

  it('UT-29: empty proxied set is a no-op (no delete/prune) + warns', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setConnected('S', true);
    const svc = new ReindexService(() => adapter, new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('UT-30: embedding failure for one tool skips only that tool', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['t1', 't2', 't3']);
    src.setConnected('S', true);
    const embedder = new FakeEmbedder();
    embedder.failFor('t2');
    const svc = new ReindexService(() => adapter, embedder, src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(2);
    const rows = (await adapter.all<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ?', ['S'])).map((r) => r.name);
    expect(rows.sort()).toEqual(['t1', 't3']);
  });

  it('UT-31: latest-state guard skips when server is not connected', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', false);
    const svc = new ReindexService(() => adapter, new FakeEmbedder(), src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(0);
    expect(await countFor(adapter, 'S')).toBe(0);
  });

  it('UT-32: repository write failure is caught + logged; prior rows intact', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', true);
    // Pre-seed a prior row for S.
    await adapter.run('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)', ['prior', 'p', '{}', 'S', 'S', null]);
    const brokenAdapter = {
      getEngine: () => 'sqlite',
      runAsync: async () => { throw new Error('disk full'); },
      getAsync: async () => undefined,
      allAsync: async () => [],
      execAsync: async () => {},
    } as any;
    const svc = new ReindexService(() => brokenAdapter, new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(0);
    expect(warn).toHaveBeenCalled();
    expect(await countFor(adapter, 'S')).toBe(1); // prior row preserved
  });
});
