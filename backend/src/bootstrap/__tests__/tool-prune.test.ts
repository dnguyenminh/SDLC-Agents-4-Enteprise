/**
 * SA4E-369 follow-up — bootstrap/tool-prune GC unit tests.
 *
 * pruneStaleCoreRows: stale core rows (server IS NULL, tool left the
 * registry) are deleted at ingestion while valid core rows and proxied rows
 * survive.
 * pruneOrphanProxyRows: rows owned by servers no longer registered (removed
 * from the child-server config) are deleted, while core rows are never
 * touched and transiently-down-but-registered servers keep their rows.
 * Guards mirror the SA4E-42 repository prune conventions: empty set never
 * wipes (BR-04/06); oversized set skipped for bound-var safety.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { SqliteAdapter } from '../../database/adapters/SqliteAdapter.js';
import { SCHEMA_V1 } from '../../engine/db/schema.js';
import { pruneStaleCoreRows, pruneOrphanProxyRows } from '../tool-prune.js';

const silent = pino({ level: 'silent' });

async function seedRow(
  adapter: SqliteAdapter,
  name: string,
  server: string | null,
): Promise<void> {
  await adapter.runAsync(
    'INSERT INTO mcp_tools (name, description, schema_json, category, server, labels, vector) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, `${name} desc`, '{}', 'web', server, name, Buffer.from([1, 2, 3])],
  );
}

async function seededNames(adapter: SqliteAdapter): Promise<string[]> {
  const rows = await adapter.allAsync<{ name: string }>('SELECT name FROM mcp_tools ORDER BY name');
  return rows.map((r) => r.name);
}

describe('pruneStaleCoreRows (SA4E-369 stale-core GC)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA_V1);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('deletes stale server-NULL rows whose tool left the registry', async () => {
    await seedRow(adapter, 'find_tools', null);              // valid core
    await seedRow(adapter, 'code_search', null);             // valid core
    await seedRow(adapter, 'api_call', null);                // ghost: WebModule removed (KSA-297)
    await seedRow(adapter, 'jira_get_issue', 'atlassian');   // proxied — out of core GC scope
    await pruneStaleCoreRows(adapter, silent, ['find_tools', 'code_search', 'mem_search']);
    expect(await seededNames(adapter)).toEqual(['code_search', 'find_tools', 'jira_get_issue']);
  });

  it('keeps a proxied row even when its name is not in coreNames (IS NULL scoping)', async () => {
    await seedRow(adapter, 't_core', null);
    await seedRow(adapter, 't_proxied', 'stitch');
    await pruneStaleCoreRows(adapter, silent, ['t_core']);
    expect(await seededNames(adapter)).toEqual(['t_core', 't_proxied']);
  });

  it('empty core registry is a no-op (never wipes the table)', async () => {
    await seedRow(adapter, 'find_tools', null);
    await pruneStaleCoreRows(adapter, silent, []);
    expect(await seededNames(adapter)).toEqual(['find_tools']);
  });

  it('oversized registry (>900) is skipped (bound-var safety)', async () => {
    await seedRow(adapter, 'find_tools', null);
    const oversized = Array.from({ length: 901 }, (_, i) => `t${i}`);
    await pruneStaleCoreRows(adapter, silent, oversized);
    expect(await seededNames(adapter)).toEqual(['find_tools']);
  });
});

describe('pruneOrphanProxyRows (SA4E-369 orphan-server GC)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA_V1);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('deletes rows owned by servers no longer registered (removed from config)', async () => {
    await seedRow(adapter, 'jira_get_issue', 'atlassian');       // orphan: server removed
    await seedRow(adapter, 'apply_design_system', 'stitch');      // registered server
    await seedRow(adapter, 'doc_export', 'markdown-exporter-local'); // registered server
    await seedRow(adapter, 'mem_search', null);                   // core row — out of proxy GC scope
    await pruneOrphanProxyRows(adapter, silent, ['stitch', 'markdown-exporter-local']);
    expect(await seededNames(adapter)).toEqual(['apply_design_system', 'doc_export', 'mem_search']);
  });

  it('keeps rows for servers registered but transiently down (retry semantics)', async () => {
    await seedRow(adapter, 'jira_get_issue', 'atlassian');
    // 'atlassian' still registered (initializeAll registers state even on failure)
    await pruneOrphanProxyRows(adapter, silent, ['atlassian']);
    expect(await seededNames(adapter)).toEqual(['jira_get_issue']);
  });

  it('never touches core rows (server IS NULL scoping)', async () => {
    await seedRow(adapter, 'mem_search', null);
    await pruneOrphanProxyRows(adapter, silent, ['some-server']);
    expect(await seededNames(adapter)).toEqual(['mem_search']);
  });

  it('empty registered list is a no-op (never wipes all proxy rows)', async () => {
    await seedRow(adapter, 'jira_get_issue', 'atlassian');
    await pruneOrphanProxyRows(adapter, silent, []);
    expect(await seededNames(adapter)).toEqual(['jira_get_issue']);
  });

  it('oversized server list (>900) is skipped (bound-var safety)', async () => {
    await seedRow(adapter, 'jira_get_issue', 'atlassian');
    const oversized = Array.from({ length: 901 }, (_, i) => `s${i}`);
    await pruneOrphanProxyRows(adapter, silent, oversized);
    expect(await seededNames(adapter)).toEqual(['jira_get_issue']);
  });
});
