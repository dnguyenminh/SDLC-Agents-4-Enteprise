/**
 * SA4E-42 IT-01..05 — re-index core lifecycle over a real SqliteAdapter DB
 * (makeTempDb) + fake event source + fake embedding.
 * (Split from reindex.it.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  harness,
  names,
  seed,
  type Harness,
} from './reindex.fixtures.js';

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
    const row = await h.adapter.getAsync<{ schema_json: string }>('SELECT schema_json FROM mcp_tools WHERE name = ?', ['jira_create_issue']);
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
});
