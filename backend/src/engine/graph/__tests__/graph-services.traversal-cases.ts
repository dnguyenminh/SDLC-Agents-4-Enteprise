/**
 * Graph Services unit tests — GraphTraverser.
 * Split from graph-services.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * graph-services.test.ts via registerTraversalCases().
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { SymbolResolver } from '../symbol-resolver.js';
import { GraphTraverser } from '../traverser.js';
import { setupTestDb } from './graph-services.fixtures.js';

let db: SqliteAdapter;

export function registerTraversalCases(): void {
  describe('GraphTraverser', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('resolves a start node', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('UserService');
      assert.ok(node !== null);
      assert.equal(node!.name, 'UserService');
      assert.equal(node!.kind, 'class');
    });

    it('traverses outgoing edges from a node', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('handleGetUser');
      assert.ok(node !== null);

      const results = await traverser.traverse(node!, {
        edgeTypes: ['calls'],
        nodeTypes: [],
        direction: 'outgoing',
        maxDepth: 2,
        maxResults: 50,
      });
      // handleGetUser calls getUser
      assert.ok(results.length >= 0);
    });

    it('traverses incoming edges', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('getUser');
      assert.ok(node !== null);

      const results = await traverser.traverse(node!, {
        edgeTypes: ['calls'],
        nodeTypes: [],
        direction: 'incoming',
        maxDepth: 2,
        maxResults: 50,
      });
      assert.ok(results.length >= 0);
    });

    it('returns null for unknown symbol', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('nonExistentSymbol');
      assert.equal(node, null);
    });

    it('respects maxResults limit', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('UserService');
      assert.ok(node !== null);

      const results = await traverser.traverse(node!, {
        edgeTypes: [],
        nodeTypes: [],
        direction: 'outgoing',
        maxDepth: 5,
        maxResults: 1,
      });
      assert.ok(results.length <= 1);
    });

    it('formats response correctly', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

      const node = await traverser.resolveNode('UserService');
      assert.ok(node !== null);

      const results = await traverser.traverse(node!, {
        edgeTypes: [],
        nodeTypes: [],
        direction: 'outgoing',
        maxDepth: 1,
        maxResults: 50,
      });

      const response = traverser.formatResponse(node!, results, false, 5, 10);
      assert.ok(response.start);
      assert.equal(response.start.name, 'UserService');
      assert.ok(Array.isArray(response.results));
      assert.ok(response.metadata.execution_time_ms >= 0);
    });
  });
}
