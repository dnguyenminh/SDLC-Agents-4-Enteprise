/**
 * SA4E-42 IT-06..09 — re-index isolation, non-blocking reads (BR-09),
 * fail-soft embedding and convergence over a real SqliteAdapter DB.
 * (Split from reindex.it.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReindexService } from '../../src/modules/orchestration/reindex/ReindexService.js';
import { ReindexSubscriber } from '../../src/modules/orchestration/reindex/ReindexSubscriber.js';
import { PerServerTaskQueue } from '../../src/modules/orchestration/reindex/PerServerTaskQueue.js';
import { ReindexActionMapper } from '../../src/modules/orchestration/reindex/ReindexActionMapper.js';
import { FakeEmbedder, FakeEventSource } from '../../src/modules/orchestration/reindex/__tests__/reindex-fakes.js';
import {
  harness,
  names,
  seed,
  silent,
  SlowEmbedder,
  waitForName,
  type Harness,
} from './reindex.fixtures.js';

describe('SA4E-42 re-index integration', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });
  afterEach(async () => { h.sub.stop(); await h.tmp.close(); });

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
    expect(rows.some((r: any) => r.name === 'export_docx')).toBe(true); // current index visible
    expect(await names(h.adapter, 'atlassian')).toEqual([]); // new tools not yet committed
    await sub.settle('atlassian'); // now the refresh completes
    expect(await names(h.adapter, 'atlassian')).toContain('jira_create_issue'); // new tools appear
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
});
