/**
 * Unit tests for GraphRepository — node counts with legacy fallback, Pega
 * detection, graph reset, node upsert and project registration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { GraphRepository } from '../GraphRepository.js';

const SCHEMA = `
CREATE TABLE graph_nodes (
  entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'DOCUMENT',
  tier TEXT NOT NULL DEFAULT 'SHARED', project_id TEXT, x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 2, cluster_id TEXT DEFAULT NULL
);
CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, target TEXT NOT NULL);
CREATE TABLE project_registry (
  project_id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '',
  last_seen TEXT NOT NULL DEFAULT (datetime('now')), created_by TEXT NOT NULL DEFAULT ''
);
`;

let adapter: SqliteAdapter;
let repo: GraphRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  repo = new GraphRepository(adapter);
});

afterEach(async () => {
  await adapter.disconnect();
});

function insertNode(entryId: string, label: string, type: string, projectId: string | null): void {
  adapter.run(
    'INSERT INTO graph_nodes (entry_id, label, type, project_id) VALUES (?, ?, ?, ?)',
    [entryId, label, type, projectId]
  );
}

describe('GraphRepository', () => {
  it('getNodeCounts splits total into code and kb', async () => {
    insertNode('code:foo', 'Code', 'DOCUMENT', 'p1');
    insertNode('pega:x', 'Pega', 'DOCUMENT', 'p1');
    insertNode('kb:1', 'KB', 'DOCUMENT', 'p1');
    const counts = await repo.getNodeCounts('p1');
    expect(counts).toEqual({ total: 3, code: 2, kb: 1 });
  });

  it('getNodeCounts falls back to legacy null-project rows', async () => {
    insertNode('code:legacy', 'Code', 'DOCUMENT', null);
    insertNode('kb:legacy', 'KB', 'DOCUMENT', null);
    const counts = await repo.getNodeCounts('ghost');
    expect(counts).toEqual({ total: 2, code: 1, kb: 1 });
  });

  it('isPegaProject detects pega-prefixed nodes', async () => {
    insertNode('pega:workflow', 'Flow', 'DOCUMENT', 'p1');
    expect(await repo.isPegaProject('p1')).toBe(true);
    expect(await repo.isPegaProject('other')).toBe(false);
  });

  it('resetGraph clears nodes and edges in a transaction', async () => {
    insertNode('code:foo', 'Code', 'DOCUMENT', 'p1');
    adapter.run('INSERT INTO graph_edges (source, target) VALUES (?, ?)', ['a', 'b']);
    await repo.resetGraph();
    expect((adapter.get<{ c: number }>('SELECT COUNT(*) c FROM graph_nodes'))?.c).toBe(0);
    expect((adapter.get<{ c: number }>('SELECT COUNT(*) c FROM graph_edges'))?.c).toBe(0);
  });

  it('upsertNode inserts and then replaces an existing node', async () => {
    await repo.upsertNode({
      entryId: 'code:x', label: 'X', type: 'FUNCTION', tier: 'PROJECT',
      projectId: 'p1', x: 1, y: 2, z: 3, level: '1', clusterId: 'c1',
    });
    const row = adapter.get<Record<string, unknown>>('SELECT * FROM graph_nodes WHERE entry_id = ?', ['code:x']);
    expect(row?.x).toBe(1);
    expect(row?.cluster_id).toBe('c1');
    expect(row?.level).toBe(1);

    await repo.upsertNode({ entryId: 'code:x', label: 'X2', type: 'FUNCTION', tier: 'PROJECT', projectId: 'p1' });
    const updated = adapter.get<Record<string, unknown>>('SELECT * FROM graph_nodes WHERE entry_id = ?', ['code:x']);
    expect(updated?.label).toBe('X2');
    expect((adapter.get<{ c: number }>('SELECT COUNT(*) c FROM graph_nodes'))?.c).toBe(1);
  });

  it('registerProject inserts and updates display info on conflict', async () => {
    await repo.registerProject('p1', 'Alpha', '/w/a', 'u1');
    let row = adapter.get<Record<string, unknown>>('SELECT * FROM project_registry WHERE project_id = ?', ['p1']);
    expect(row?.display_name).toBe('Alpha');
    expect(row?.created_by).toBe('u1');

    await repo.registerProject('p1', 'Alpha2', '/w/b');
    row = adapter.get<Record<string, unknown>>('SELECT * FROM project_registry WHERE project_id = ?', ['p1']);
    expect(row?.display_name).toBe('Alpha2');
    expect(row?.workspace_path).toBe('/w/b');
    expect(row?.created_by).toBe('u1');
  });
});