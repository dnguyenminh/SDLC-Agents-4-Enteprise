/**
 * kb_graph_cross_sync / kb_graph_remove_cross tool tests
 * (split from KBGraphModule.test.ts — BR-18).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import type { KBGraphModule } from '../KBGraphModule.js';
import { createGraphModule, insertNode, insertEdge } from './KBGraphModule.fixtures.js';

describe('kb_graph_cross_sync', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    ({ adapter, module } = await createGraphModule());
  });

  afterEach(async () => adapter.disconnect());

  it('requires source and target', async () => {
    const handler = module.getToolHandlers().get('kb_graph_cross_sync')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
  });

  it('creates cross edges between matching nodes', async () => {
    insertNode(adapter, 's1', 'Common', 'CLASS', 'CODE', 'projA');
    insertNode(adapter, 't1', 'Common', 'CLASS', 'CODE', 'projB');

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
    insertNode(adapter, 's1', 'Unique', 'CLASS', 'CODE', 'projA');
    insertNode(adapter, 't1', 'Different', 'CLASS', 'CODE', 'projB');

    const handler = module.getToolHandlers().get('kb_graph_cross_sync')!;
    const result = await handler({ source_project_id: 'projA', target_project_id: 'projB' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.edgesCreated).toBe(0);
    expect(data.matches).toBe(0);
  });

  it('remove_cross removes CROSS_TENANT edges', async () => {
    insertNode(adapter, 's1', 'Common', 'CLASS', 'CODE', 'projA');
    insertNode(adapter, 't1', 'Common', 'CLASS', 'CODE', 'projB');
    insertEdge(adapter, 's1', 't1', 0.8, 'CROSS_TENANT');

    const handler = module.getToolHandlers().get('kb_graph_remove_cross')!;
    const result = await handler({ project_a: 'projA', project_b: 'projB' });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.removed).toBe(1);

    const count = adapter.prepare('SELECT COUNT(*) c FROM graph_edges').get() as any;
    expect(count.c).toBe(0);
  });
});
