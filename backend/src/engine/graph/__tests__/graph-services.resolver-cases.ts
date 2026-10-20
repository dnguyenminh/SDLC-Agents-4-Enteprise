/**
 * Graph Services unit tests — SymbolResolver, CallGraphService, FileResolver.
 * Split from graph-services.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * graph-services.test.ts via registerResolverCases().
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { SymbolResolver } from '../symbol-resolver.js';
import { CallGraphService } from '../call-graph-service.js';
import { FileResolver } from '../file-resolver.js';
import { GraphRepository } from '../graph-repository.js';
import { setupTestDb } from './graph-services.fixtures.js';

let db: SqliteAdapter;

export function registerResolverCases(): void {
  describe('SymbolResolver', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('resolves exact symbol name', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const results = await resolver.resolve('getUser');
      assert.ok(results.length >= 1);
      assert.equal(results[0].name, 'getUser');
    });

    it('resolves qualified name (Class.method)', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const results = await resolver.resolve('UserService.getUser');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'getUser');
      assert.equal(results[0].filePath, 'src/service.ts');
    });

    it('returns empty for non-existent symbol', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const results = await resolver.resolve('nonExistentSymbol');
      assert.equal(results.length, 0);
    });

    it('suggests similar symbols', async () => {
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const suggestions = await resolver.suggest('User');
      assert.ok(suggestions.length > 0);
      assert.ok(suggestions.some(s => s.includes('User')));
    });
  });

  describe('CallGraphService', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('finds direct callers of a method', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallers('getUser', 1, 20);
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.some(r => r.symbol === 'handleGetUser'));
      assert.equal(result.metadata.depthSearched, 1);
    });

    it('finds transitive callers with depth 2', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallers('findById', 2, 20);
      // findById <- getUser <- handleGetUser
      assert.ok(result.results.length >= 1);
    });

    it('finds callees of a method', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallees('handleGetUser', 1, 20);
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.some(r => r.symbol === 'getUser'));
    });

    it('returns empty for unknown symbol', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallers('unknownFunction', 1, 20);
      assert.equal(result.results.length, 0);
      assert.equal(result.resolvedTo.length, 0);
    });

    it('respects limit parameter', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallers('getUser', 3, 1);
      assert.ok(result.results.length <= 1);
    });

    it('clamps depth to max 5', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const service = new CallGraphService(graphRepo, resolver);

      const result = await service.findCallers('getUser', 10, 20);
      assert.equal(result.metadata.depthSearched, 5);
    });
  });

  describe('FileResolver', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('resolves exact relative path', () => {
      const resolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const result = resolver.resolveFile('src/service.ts');
      assert.equal(result, 'src/service.ts');
    });

    it('returns null for non-indexed file', () => {
      const resolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const result = resolver.resolveFile('src/nonexistent.ts');
      assert.equal(result, null);
    });

    it('identifies external modules', () => {
      const resolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      assert.equal(resolver.isExternal('fs'), true);
      assert.equal(resolver.isExternal('path'), true);
      assert.equal(resolver.isExternal('lodash'), true);
    });

    it('identifies relative imports as non-external', () => {
      const resolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      assert.equal(resolver.isExternal('./service'), false);
    });
  });
}
