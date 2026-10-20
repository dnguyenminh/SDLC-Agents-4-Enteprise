/**
 * KBGraphModule handler tests (split from KBGraphModule.test.ts — BR-18).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import type { KBGraphModule } from '../KBGraphModule.js';
import { createGraphModule, insertNode, insertEdge } from './KBGraphModule.fixtures.js';

describe('KBGraphModule handlers', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    ({ adapter, module } = await createGraphModule());
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
    insertNode(adapter, 'n1', 'Node1', 'CLASS', 'CODE');
    insertNode(adapter, 'n2', 'Node2', 'FUNCTION', 'CODE');
    insertEdge(adapter, 'n1', 'n2', 0.5);

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_stats')!({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodeCount).toBe(2);
    expect(data.edgeCount).toBe(1);
    expect(data.typeDistribution).toEqual({ CLASS: 1, FUNCTION: 1 });
  });

  it('kb_graph_query finds nodes by query', async () => {
    insertNode(adapter, 'n1', 'HelloWorld', 'FUNCTION', 'CODE');
    insertNode(adapter, 'n2', 'Other', 'CLASS', 'CODE');

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_query')!({ query: 'Hello' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].id).toBe('n1');
  });

  it('kb_graph_query filters by type', async () => {
    insertNode(adapter, 'n1', 'A', 'FUNCTION', 'CODE');
    insertNode(adapter, 'n2', 'B', 'CLASS', 'CODE');

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
    insertNode(adapter, 'a', 'A', 'TYPE', 'CODE');
    insertNode(adapter, 'b', 'B', 'TYPE', 'CODE');

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
    insertNode(adapter, 'a', 'A', 'TYPE', 'CODE');
    insertNode(adapter, 'b', 'B', 'TYPE', 'CODE');
    insertEdge(adapter, 'a', 'b', 1.0);

    const handlers = module.getToolHandlers();
    const result = await handlers.get('kb_graph_community')!({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.communities.length).toBeGreaterThanOrEqual(1);
  });

  it('kb_graph_pagerank ranks nodes', async () => {
    insertNode(adapter, 'a', 'A', 'CLASS', 'CODE');
    insertNode(adapter, 'b', 'B', 'CLASS', 'CODE');
    insertEdge(adapter, 'a', 'b', 1.0);

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
