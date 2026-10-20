/**
 * kb_graph_merge tool tests (split from KBGraphModule.test.ts — BR-18).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import type { KBGraphModule } from '../KBGraphModule.js';
import { createGraphModule, insertNode, insertEdge } from './KBGraphModule.fixtures.js';

describe('kb_graph_merge', () => {
  let adapter: SqliteAdapter;
  let module: KBGraphModule;

  beforeEach(async () => {
    ({ adapter, module } = await createGraphModule());
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
    insertNode(adapter, 'n1', 'A', 'CLASS', 'CODE', 'proj1');
    insertNode(adapter, 'n2', 'B', 'CLASS', 'CODE', 'proj2');

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1', 'proj2'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.stats.totalNodes).toBe(2);
    expect(data.stats.projectCount).toBe(2);
    expect(data.stats.conflicts).toBe(0);
  });

  it('detects label conflicts across projects', async () => {
    insertNode(adapter, 'n1', 'SameLabel', 'CLASS', 'CODE', 'proj1');
    insertNode(adapter, 'n2', 'SameLabel', 'CLASS', 'CODE', 'proj2');

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1', 'proj2'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.stats.conflicts).toBeGreaterThanOrEqual(1);
  });

  it('includes edges in merged result', async () => {
    insertNode(adapter, 'n1', 'A', 'CLASS', 'CODE', 'proj1');
    insertNode(adapter, 'n2', 'B', 'CLASS', 'CODE', 'proj1');
    insertEdge(adapter, 'n1', 'n2', 0.5);

    const handler = module.getToolHandlers().get('kb_graph_merge')!;
    const result = await handler({ project_ids: ['proj1'] });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0].type).toBe('RELATED_TO');
  });
});
