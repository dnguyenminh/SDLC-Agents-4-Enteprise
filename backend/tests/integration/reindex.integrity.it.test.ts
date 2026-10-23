/**
 * SA4E-42 IT-10..13 — prune-on-reconnect, migration idempotency,
 * cross-server collision (F-01) and subscription lifecycle.
 * (Split from reindex.it.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteAdapter } from '../../src/database/adapters/SqliteAdapter.js';
import { migrateAddMcpToolsServerColumn } from '../../src/engine/db/migrations.js';
import { ReindexService } from '../../src/modules/orchestration/reindex/ReindexService.js';
import { ReindexSubscriber } from '../../src/modules/orchestration/reindex/ReindexSubscriber.js';
import { PerServerTaskQueue } from '../../src/modules/orchestration/reindex/PerServerTaskQueue.js';
import { ReindexActionMapper } from '../../src/modules/orchestration/reindex/ReindexActionMapper.js';
import { FakeEmbedder, FakeEventSource } from '../../src/modules/orchestration/reindex/__tests__/reindex-fakes.js';
import { harness, names, seed, silent, type Harness } from './reindex.fixtures.js';

describe('SA4E-42 re-index integration', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });
  afterEach(async () => { h.sub.stop(); await h.tmp.close(); });

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
    const row = await h.adapter.getAsync<{ server: string }>('SELECT server FROM mcp_tools WHERE name = ?', ['common_tool']);
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
