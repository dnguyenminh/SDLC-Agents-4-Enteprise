/**
 * SA4E-42 UT-28..32 — ReindexService: scoped selection, empty no-op, embed
 * skip-on-fail, latest-state guard, and fail-soft write (IR-3/4/7/9, BR-06).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import type Database from 'better-sqlite3';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';
import { ReindexService } from '../ReindexService.js';
import { FakeEmbedder, FakeToolSource } from './reindex-fakes.js';

const silent = pino({ level: 'silent' });

function countFor(db: Database.Database, server: string): number {
  return (db.prepare('SELECT COUNT(*) c FROM mcp_tools WHERE server = ?').get(server) as any).c;
}

describe('ReindexService', () => {
  let tmp: TempDb;
  let db: Database.Database;

  beforeEach(() => { tmp = makeTempDb(); db = tmp.dbManager.getDb(); });
  afterEach(() => tmp.close());

  it('UT-28: only tools with category === server are upserted', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['a', 'b']);
    src.setTools('T', ['c']);
    src.setConnected('S', true);
    const svc = new ReindexService(() => db, new FakeEmbedder(), src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(2);
    expect(countFor(db, 'S')).toBe(2);
    expect(countFor(db, 'T')).toBe(0);
  });

  it('UT-29: empty proxied set is a no-op (no delete/prune) + warns', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setConnected('S', true);
    const svc = new ReindexService(() => db, new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
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
    const svc = new ReindexService(() => db, embedder, src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(2);
    const rows = (db.prepare('SELECT name FROM mcp_tools WHERE server = ?').all('S') as any[]).map((r) => r.name);
    expect(rows.sort()).toEqual(['t1', 't3']);
  });

  it('UT-31: latest-state guard skips when server is not connected', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', false);
    const svc = new ReindexService(() => db, new FakeEmbedder(), src, silent);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(0);
    expect(countFor(db, 'S')).toBe(0);
  });

  it('UT-32: repository write failure is caught + logged; prior rows intact', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', true);
    // Pre-seed a prior row for S.
    db.prepare('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)')
      .run('prior', 'p', '{}', 'S', 'S', null);
    const brokenDb = { transaction: () => { throw new Error('disk full'); }, prepare: db.prepare.bind(db) } as any;
    const svc = new ReindexService(() => brokenDb, new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
    const res = await svc.reindexConnected('S');
    expect(res.upserted).toBe(0);
    expect(warn).toHaveBeenCalled();
    expect(countFor(db, 'S')).toBe(1); // prior row preserved
  });
});
