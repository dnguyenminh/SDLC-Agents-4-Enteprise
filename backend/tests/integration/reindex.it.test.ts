/**
 * SA4E-42 IT-01..13 — integration tests for the event-driven re-index over a real
 * SqliteAdapter DB (makeTempDb) + fake event source + fake embedding.
 *
 * IT-01 is the BUG REPRODUCTION: before the ReindexSubscriber existed, a late
 * `connected` event never refreshed `mcp_tools`, so find_tools could not discover
 * the server's tools. It now asserts the fixed behaviour (tools become discoverable).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { SqliteAdapter } from '../../src/database/adapters/SqliteAdapter.js';
import { makeTempDb, type TempDb } from '../../src/__tests__/sa4e-testkit.js';
import { migrateAddMcpToolsServerColumn } from '../../src/engine/db/migrations.js';
import { ReindexActionMapper } from '../../src/modules/orchestration/reindex/ReindexActionMapper.js';
import { PerServerTaskQueue } from '../../src/modules/orchestration/reindex/PerServerTaskQueue.js';
import { ReindexService } from '../../src/modules/orchestration/reindex/ReindexService.js';
import { ReindexSubscriber } from '../../src/modules/orchestration/reindex/ReindexSubscriber.js';
import {
  FakeEmbedder,
  FakeEventSource,
  FakeToolSource,
} from '../../src/modules/orchestration/reindex/__tests__/reindex-fakes.js';
import type { IEmbedder } from '../../src/modules/orchestration/reindex/models/ports.js';

const silent = pino({ level: 'silent' });

/** Embedder that adds latency so a re-index stays in flight (IT-07/BR-09). */
class SlowEmbedder implements IEmbedder {
  constructor(private readonly delayMs: number) {}
  async generateEmbedding(text: string): Promise<number[]> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const v = [0, 0, 0, 0];
    for (let i = 0; i < text.length; i++) v[i % 4] += text.charCodeAt(i) / 255;
    return v;
  }
}

interface Harness {
  tmp: TempDb;
  adapter: any;
  src: FakeToolSource;
  source: FakeEventSource;
  sub: ReindexSubscriber;
}

async function harness(): Promise<Harness> {
  const tmp = await makeTempDb();
  const adapter = tmp.dbManager.getAdapter();
  const src = new FakeToolSource();
  const source = new FakeEventSource();
  const service = new ReindexService(() => adapter, new FakeEmbedder(), src, silent);
  const sub = new ReindexSubscriber(source, service, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
  sub.start();
  return { tmp, adapter, src, source, sub };
}

async function names(adapter: any, server: string): Promise<string[]> {
  const rows = await adapter.allAsync<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name', [server]);
  return rows.map(r => r.name);
}

async function seed(adapter: any, server: string | null, name: string): Promise<void> {
  await adapter.runAsync('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)', [name, `${name} d`, '{}', server ?? 'memory', server, null]);
}

async function waitForName(adapter: any, server: string, name: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await adapter.allAsync<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ?', [server]);
    if (rows.some(r => r.name === name)) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return false;
}

describe('SA4E-42 re-index integration', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });
  afterEach(async () => { h.sub.stop(); await h.tmp.close(); });

  it('IT-01 (repro): late connect makes tools discoverable within ≤5s', async () => {
    expect(await names(h.adapter, 'atlassian')).toEqual([]); // disconnected at startup
    h.src.setTools('atlassian', ['jira_create_issue', 'jira_search']);
    h.src.setConnected('atlassian', true);
    const t0 = Date.now();
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toContain('jira_create_issue');
    const row = await h.adapter.getAsync<any>('SELECT schema_json FROM mcp_tools WHERE name = ?', ['jira_create_issue']);
    expect(() => JSON.parse(row.schema_json)).not.toThrow();
    expect(Date.now() - t0).toBeLessThanOrEqual(5000);
  });

  it('IT-02: previously indexed tools survive a late connect', async () => {
    await seed(h.adapter, 'markdown-exporter', 'export_docx');
    h.src.setTools('atlassian', ['jira_search']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'markdown-exporter')).toEqual(['export_docx']);
    expect(await names(h.adapter, 'atlassian')).toEqual(['jira_search']);
  });

  it('IT-03: disconnect removes only that server rows', async () => {
    h.src.setTools('atlassian', ['jira_search']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    await seed(h.adapter, 'markdown-exporter', 'export_docx');
    h.source.emit('atlassian', 'disconnected');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toEqual([]);
    expect(await names(h.adapter, 'markdown-exporter')).toEqual(['export_docx']);
  });

  it('IT-04: failed state removes tools (same as disconnect)', async () => {
    h.src.setTools('atlassian', ['jira_search']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    h.source.emit('atlassian', 'failed');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toEqual([]);
  });

  it('IT-05: idempotent repeated connects → no duplicates', async () => {
    h.src.setTools('atlassian', ['a', 'b', 'c']);
    h.src.setConnected('atlassian', true);
    for (let i = 0; i < 5; i++) {
      h.source.emit('atlassian', 'connected');
      await h.sub.settle('atlassian');
    }
    expect(await names(h.adapter, 'atlassian')).toEqual(['a', 'b', 'c']);
  });

  it('IT-06: scoped ops leave other servers + core byte-identical', async () => {
    await seed(h.adapter, 'markdown-exporter', 'export_docx');
    await seed(h.adapter, null, 'mem_search');
    const before = await h.adapter.allAsync<{ name: string; server: string }>("SELECT name, server FROM mcp_tools WHERE server IS NULL OR server='markdown-exporter' ORDER BY name");
    h.src.setTools('atlassian', ['jira_search']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    h.source.emit('atlassian', 'disconnected');
    await h.sub.settle('atlassian');
    const after = await h.adapter.allAsync<{ name: string; server: string }>("SELECT name, server FROM mcp_tools WHERE server IS NULL OR server='markdown-exporter' ORDER BY name");
    expect(after).toEqual(before);
  });

  it('IT-07: non-blocking read during in-flight refresh (BR-09)', async () => {
    await seed(h.adapter, 'markdown-exporter', 'export_docx'); // pre-existing index stays readable
    const svc = new ReindexService(() => h.adapter, new SlowEmbedder(100), h.src, silent);
    const source = new FakeEventSource();
    const sub = new ReindexSubscriber(source, svc, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
    sub.start();
    h.src.setTools('atlassian', ['jira_create_issue', 'jira_search', 'jira_update']);
    h.src.setConnected('atlassian', true);
    source.emit('atlassian', 'connected'); // slow re-index starts (in flight)
    await new Promise((r) => setTimeout(r, 20)); // let the first embed be in progress
    const t0 = Date.now();
    const rows = await h.adapter.allAsync<any>('SELECT * FROM mcp_tools');
    const readMs = Date.now() - t0;
    expect(readMs).toBeLessThan(50); // read not blocked by the async refresh
    expect(rows.some((r) => r.name === 'export_docx')).toBe(true); // current index visible
    expect(await names(h.adapter, 'atlassian')).toEqual([]); // new tools not yet committed
    await sub.settle('atlassian'); // now the refresh completes
    const found = await waitForName(h.adapter, 'atlassian', 'jira_create_issue');
    expect(found).toBe(true);
    sub.stop();
  });

  it('IT-08: fail-soft on embedding error leaves prior rows; later event succeeds', async () => {
    await seed(h.adapter, 'atlassian', 'jira_old');
    const embedder = new FakeEmbedder();
    embedder.failFor('jira_new');
    const svc = new ReindexService(() => h.adapter, embedder, h.src, silent);
    const source = new FakeEventSource();
    const sub = new ReindexSubscriber(source, svc, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
    sub.start();
    h.src.setTools('atlassian', ['jira_new']); // only failing tool → prepared set empty → prune skipped
    h.src.setConnected('atlassian', true);
    source.emit('atlassian', 'connected');
    await sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toContain('jira_old'); // prior preserved
    h.src.setTools('atlassian', ['jira_ok']);
    source.emit('atlassian', 'connected');
    await sub.settle('atlassian');
    const found = await waitForName(h.adapter, 'atlassian', 'jira_ok', 2000);
    expect(found).toBe(true); // subscriber still alive
    sub.stop();
  });

  it('IT-09: convergence after connect/disconnect cycles', async () => {
    h.src.setTools('atlassian', ['a', 'b']);
    for (const state of ['connected', 'disconnected', 'connected', 'disconnected', 'connected'] as const) {
      h.src.setConnected('atlassian', state === 'connected');
      h.source.emit('atlassian', state);
      await h.sub.settle('atlassian');
    }
    expect(await names(h.adapter, 'atlassian')).toEqual(['a', 'b']);
  });

  it('IT-10: prune tools removed upstream on reconnect', async () => {
    h.src.setTools('atlassian', ['t1', 't2', 't3', 't4', 't5']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    h.src.setTools('atlassian', ['t1', 't2', 't6']);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toEqual(['t1', 't2', 't6']);
  });

  it('IT-11: migration adds server column + idempotent index', async () => {
    const adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.execAsync(`CREATE TABLE mcp_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL, schema_json TEXT NOT NULL, category TEXT, vector BLOB)`);
    await adapter.runAsync('INSERT INTO mcp_tools (name, description, schema_json) VALUES (?,?,?)', ['old', 'd', '{}']);
    await migrateAddMcpToolsServerColumn(adapter);
    await migrateAddMcpToolsServerColumn(adapter); // second run is a safe no-op
    const cols = await adapter.allAsync(`SELECT name FROM pragma_table_info('mcp_tools')`);
    expect(cols.map((c: any) => c.name)).toContain('server');
    const idx = await adapter.getAsync("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_mcp_tools_server'");
    expect(idx).toBeDefined();
    const existing = await adapter.getAsync('SELECT server FROM mcp_tools WHERE name = ?', ['old']) as any;
    expect(existing.server).toBeNull();
    await adapter.disconnect();
  });

  it('IT-12: cross-server name collision is not silently hijacked (F-01)', async () => {
    const warn = vi.fn();
    await seed(h.adapter, 'A', 'common_tool');
    const svc = new ReindexService(() => h.adapter, new FakeEmbedder(), h.src, { info: vi.fn(), warn } as any);
    const source = new FakeEventSource();
    const sub = new ReindexSubscriber(source, svc, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
    sub.start();
    h.src.setTools('B', ['common_tool']);
    h.src.setConnected('B', true);
    source.emit('B', 'connected');
    await sub.settle('B');
    const row = await h.adapter.getAsync<any>('SELECT server FROM mcp_tools WHERE name = ?', ['common_tool']);
    expect(row.server).toBe('A'); // not hijacked by B
    expect(warn).toHaveBeenCalled();
    sub.stop();
  });

  it('IT-13: subscription lifecycle (start processes, stop halts writes)', async () => {
    h.src.setTools('atlassian', ['jira_search']);
    h.src.setConnected('atlassian', true);
    h.source.emit('atlassian', 'connected');
    await h.sub.settle('atlassian');
    expect(await names(h.adapter, 'atlassian')).toEqual(['jira_search']);
    h.sub.stop();
    h.src.setTools('atlassian', ['jira_new']);
    h.source.emit('atlassian', 'connected'); // no listener after stop
    await new Promise((r) => setTimeout(r, 10));
    expect(await names(h.adapter, 'atlassian')).toEqual(['jira_search']); // no new writes
  });
});
