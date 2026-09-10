import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { GraphService } from '../service/index.js';
import { KBGraphModule } from '../KBGraphModule.js';
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

const log = pino({ level: 'silent' }) as any;

describe('KBGraphModule handlers', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(GRAPH_SCHEMA);
    const svc = new GraphService(adapter as any, log);
    module = new (class extends KBGraphModule {
      constructor() {
        super(log);
        (this as any).graphService = svc;
      }
      async initialize() { (this as any)._status = 'ready'; }
    })();
  });

  afterEach(async () => adapter.disconnect());

  it('kb_graph_stats returns zeros on empty graph', async () => {
    const handlers = module.getToolHandlers();
    const handler = handlers.get('kb_graph_stats')!;
    const result = await handler({});
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodeCount).toBe(0);
    expect(data.edgeCount).toBe(0);
  });

  it('kb_graph_stats returns correct counts', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'Node1', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'Node2', 'FUNCTION', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('n1', 'n2', 0.5)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_stats')!({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodeCount).toBe(2);
    expect(data.edgeCount).toBe(1);
    expect(data.typeDistribution).toEqual({ CLASS: 1, FUNCTION: 1 });
  });

  it('kb_graph_query finds nodes by query', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'HelloWorld', 'FUNCTION', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'Other', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_query')!({ query: 'Hello' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].id).toBe('n1');
  });

  it('kb_graph_query filters by type', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'A', 'FUNCTION', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'B', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_query')!({ type: 'CLASS' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].id).toBe('n2');
  });

  it('kb_graph_add_node creates a node', async () => {
    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_add_node')!({
      label: 'TestNode', type: 'CLASS', tier: 'CODE',
    });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.status).toBe('added');
    expect(data.node).toBeDefined();
    expect(data.node.label).toBe('TestNode');

    const count = adapter.prepare('SELECT COUNT(*) c FROM graph_nodes').get() as any;
    expect(count.c).toBe(1);
  });

  it('kb_graph_add_edge creates an edge', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('a', 'A', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('b', 'B', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_add_edge')!({ source: 'a', target: 'b' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.status).toBe('added');

    const count = adapter.prepare('SELECT COUNT(*) c FROM graph_edges').get() as any;
    expect(count.c).toBe(1);
  });

  it('kb_graph_add_edge requires source and target', async () => {
    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_add_edge')!({ source: 'a' });
    expect(result.isError).toBe(true);
  });

  it('kb_graph_community detects clusters', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('a', 'A', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('b', 'B', 'TYPE', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('a', 'b', 1.0)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_community')!({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.communities.length).toBeGreaterThanOrEqual(1);
  });

  it('kb_graph_pagerank ranks nodes', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('a', 'A', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('b', 'B', 'CLASS', 'CODE', '', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('a', 'b', 1.0)`).run();

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_pagerank')!({ top_n: 2 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.ranked).toHaveLength(2);
  });

  it('tool definitions include all 10 tools', () => {
    const defs = module.getToolDefinitions();
    const names = defs.map(d => d.name);
    expect(names).toContain('kb_graph_query');
    expect(names).toContain('kb_graph_add_node');
    expect(names).toContain('kb_graph_add_edge');
    expect(names).toContain('kb_graph_community');
    expect(names).toContain('kb_graph_pagerank');
    expect(names).toContain('kb_graph_stats');
    expect(names).toContain('kb_graph_merge');
    expect(names).toContain('kb_graph_cross_sync');
    expect(names).toContain('kb_graph_remove_cross');
  });
});

describe('kb_graph_merge', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(GRAPH_SCHEMA);
    const svc = new GraphService(adapter as any, log);
    module = new (class extends KBGraphModule {
      constructor() { super(log); (this as any).graphService = svc; }
      async initialize() { (this as any)._status = 'ready'; }
    })();
  });

  afterEach(async () => adapter.disconnect());

  it('returns empty for no projectIds', async () => {
    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: [] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.stats.totalNodes).toBe(0);
    expect(data.stats.projectCount).toBe(0);
  });

  it('merges nodes from multiple projects', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'A', 'CLASS', 'CODE', 'proj1', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'B', 'CLASS', 'CODE', 'proj2', 0, 0, 0, 0)`).run();

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1', 'proj2'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.stats.totalNodes).toBe(2);
    expect(data.stats.projectCount).toBe(2);
    expect(data.stats.conflicts).toBe(0);
  });

  it('detects label conflicts across projects', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'SameLabel', 'CLASS', 'CODE', 'proj1', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'SameLabel', 'CLASS', 'CODE', 'proj2', 0, 0, 0, 0)`).run();

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1', 'proj2'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.stats.conflicts).toBeGreaterThanOrEqual(1);
  });

  it('includes edges in merged result', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n1', 'A', 'CLASS', 'CODE', 'proj1', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('n2', 'B', 'CLASS', 'CODE', 'proj1', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES ('n1', 'n2', 0.5)`).run();

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0].type).toBe('RELATED_TO');
  });
});

describe('kb_graph_cross_sync', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(GRAPH_SCHEMA);
    const svc = new GraphService(adapter as any, log);
    module = new (class extends KBGraphModule {
      constructor() { super(log); (this as any).graphService = svc; }
      async initialize() { (this as any)._status = 'ready'; }
    })();
  });

  afterEach(async () => adapter.disconnect());

  it('requires source and target', async () => {
    const handler = module.getToolHandlers().get('kb_graph_cross_sync')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
  });

  it('creates cross edges between matching nodes', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('s1', 'Common', 'CLASS', 'CODE', 'projA', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('t1', 'Common', 'CLASS', 'CODE', 'projB', 0, 0, 0, 0)`).run();

    const handler = module.getToolHandlers().get('kb_graph_cross_sync')!;
    const result = await handler({ source_project_id: 'projA', target_project_id: 'projB' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.edgesCreated).toBe(1);
    expect(data.matches).toBe(1);

    const edge = adapter.prepare('SELECT * FROM graph_edges').get() as any;
    expect(edge.rel_type).toBe('CROSS_TENANT');
    expect(edge.weight).toBe(0.8);
  });

  it('handles no matching nodes', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('s1', 'Unique', 'CLASS', 'CODE', 'projA', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('t1', 'Different', 'CLASS', 'CODE', 'projB', 0, 0, 0, 0)`).run();

    const handler = module.getToolHandlers().get('kb_graph_cross_sync')!;
    const result = await handler({ source_project_id: 'projA', target_project_id: 'projB' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.edgesCreated).toBe(0);
    expect(data.matches).toBe(0);
  });

  it('remove_cross removes CROSS_TENANT edges', async () => {
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('s1', 'Common', 'CLASS', 'CODE', 'projA', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
      VALUES ('t1', 'Common', 'CLASS', 'CODE', 'projB', 0, 0, 0, 0)`).run();
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight, rel_type) VALUES ('s1', 't1', 0.8, 'CROSS_TENANT')`).run();

    const handler = module.getToolHandlers().get('kb_graph_remove_cross')!;
    const result = await handler({ project_a: 'projA', project_b: 'projB' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.removed).toBe(1);

    const count = adapter.prepare('SELECT COUNT(*) c FROM graph_edges').get() as any;
    expect(count.c).toBe(0);
  });
});
