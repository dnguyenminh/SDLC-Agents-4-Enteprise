/**
 * SA4E-415 — graph query rules: cycle guard, node cap, stable ordering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { bfsGraph } from '../graph-traversal.js';
import { makeRetrievalDb, P } from './retrieval-fixtures.js';

describe('SA4E-415 graph traversal (cycle guard / node cap / stable ordering)', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = await makeRetrievalDb();
    // symLogin → symUtil (CALLS, PROVEN ev1); symUtil → symLogin (CALLS) = CYCLE
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('cycle guard: A→B→A terminates and returns each node once', async () => {
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 5 });
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('symUtil');
    expect(ids).not.toContain('symLogin'); // root not re-visited through the cycle
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('node cap stops expansion', async () => {
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { nodeCap: 1 });
    expect(nodes).toHaveLength(1);
  });

  it('stable ordering: same input yields identical output order', async () => {
    const run1 = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 3 });
    const run2 = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 3 });
    expect(run1).toEqual(run2);
  });

  it('depth labeling: neighbors of root are depth 1', async () => {
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 1 });
    for (const n of nodes) expect(n.depth).toBe(1);
  });

  it('direct vs inferred evidence travels with nodes', async () => {
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 1 });
    const util = nodes.find((n) => n.id === 'symUtil');
    expect(util?.evidence).toBe('direct'); // rel1 has PROVEN evidence, sorted first (CALLS)
  });

  it('kind filter restricts traversal', async () => {
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { kinds: ['USES'] });
    expect(nodes.map((n) => n.id)).toEqual(['symUtil']);
    const none = await bfsGraph(adapter as any, 'S1', 'symLogin', { kinds: ['INHERITS'] });
    expect(none).toHaveLength(0);
  });

  it('snapshot pin: symbols of another snapshot are invisible to traversal', async () => {
    // symAuth2 lives only in S2 — BFS pinned to S1 must never see it
    const nodes = await bfsGraph(adapter as any, 'S1', 'symLogin', { maxDepth: 5 });
    expect(nodes.map((n) => n.id)).not.toContain('symAuth2');
  });
});
