import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { GraphService } from '../index.js';
import pino from 'pino';

const GRAPH_SCHEMA = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED',
  project_id TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 2, cluster_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, target TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5, rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
  UNIQUE(source, target)
);
`;

const log = pino({ level: 'silent' });

describe('GraphService', () => {
  let adapter: SqliteAdapter;
  let svc: GraphService;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(GRAPH_SCHEMA);
    svc = new GraphService(adapter as any, log);
  });

  afterEach(async () => adapter.disconnect());

  describe('searchNodes', () => {
    beforeEach(() => {
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('n1', 'Alpha', 'FUNCTION', 'CODE', 'p1', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('n2', 'Beta', 'CLASS', 'CODE', 'p1', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('n3', 'Gamma', 'DOCUMENT', 'SHARED', 'p2', 0, 0, 0, 0)`).run();
    });

    it('returns all nodes when no filters', async () => {
      const nodes = await svc.searchNodes();
      expect(nodes).toHaveLength(3);
    });

    it('filters by query (label LIKE)', async () => {
      const nodes = await svc.searchNodes('Alpha');
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('n1');
    });

    it('filters by type', async () => {
      const nodes = await svc.searchNodes(undefined, 'CLASS');
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('n2');
    });

    it('filters by tier', async () => {
      const nodes = await svc.searchNodes(undefined, undefined, 'SHARED');
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('n3');
    });

    it('respects limit', async () => {
      const nodes = await svc.searchNodes(undefined, undefined, undefined, 1);
      expect(nodes).toHaveLength(1);
    });
  });

  describe('getEdgesForNodeIds', () => {
    beforeEach(() => {
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('a', 'A', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('b', 'B', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('c', 'C', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight, rel_type) VALUES ('a', 'b', 0.8, 'RELATED_TO')`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight, rel_type) VALUES ('b', 'c', 0.5, 'RELATED_TO')`).run();
    });

    it('returns edges where either endpoint matches', async () => {
      const edges = await svc.getEdgesForNodeIds(['a', 'b']);
      expect(edges).toHaveLength(2);
    });

    it('returns empty for unknown ids', async () => {
      const edges = await svc.getEdgesForNodeIds(['x']);
      expect(edges).toEqual([]);
    });
  });

  describe('detectCommunities', () => {
    it('returns empty when no edges', async () => {
      const communities = await svc.detectCommunities();
      expect(communities).toEqual([]);
    });

    it('detects a single community from connected nodes', async () => {
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('a', 'A', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('b', 'B', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('a', 'b', 1.0)`).run();
      const communities = await svc.detectCommunities(10, 2);
      expect(communities).toHaveLength(1);
      expect(communities[0].nodeCount).toBe(2);
    });
  });

  describe('computePageRank', () => {
    it('returns empty when no edges', async () => {
      const ranked = await svc.computePageRank();
      expect(ranked).toEqual([]);
    });

    it('ranks nodes by connectivity', async () => {
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('hub', 'Hub', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('a', 'A', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('b', 'B', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('hub', 'a', 1.0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('hub', 'b', 1.0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('a', 'b', 0.5)`).run();

      const ranked = await svc.computePageRank(0.85, 20, 0.001, 3);
      expect(ranked).toHaveLength(3);
      // 'b' has 2 incoming edges (hub→b, a→b) vs hub has 0, so 'b' ranks highest
      expect(ranked[0].nodeId).toBe('b');
    });
  });

  describe('getGraphStats', () => {
    it('returns zero counts on empty graph', async () => {
      const stats = await svc.getGraphStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.density).toBe(0);
      expect(stats.typeDistribution).toEqual({});
    });

    it('returns correct counts and density', async () => {
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('a', 'A', 'FUNCTION', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
        VALUES ('b', 'B', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
      adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('a', 'b', 1.0)`).run();

      const stats = await svc.getGraphStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.density).toBeGreaterThan(0);
      expect(stats.typeDistribution.FUNCTION).toBe(1);
      expect(stats.typeDistribution.CLASS).toBe(1);
    });
  });
});
