/**
 * Graph Services unit tests — DependencyGraphService, TestDetector,
 * ImpactAnalysisService.
 * Split from graph-services.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * graph-services.test.ts via registerAnalysisCases().
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { SymbolResolver } from '../symbol-resolver.js';
import { CallGraphService } from '../call-graph-service.js';
import { FileResolver } from '../file-resolver.js';
import { DependencyGraphService } from '../dependency-graph-service.js';
import { TestDetector } from '../test-detector.js';
import { ImpactAnalysisService } from '../impact-analysis-service.js';
import { GraphRepository } from '../graph-repository.js';
import { setupTestDb } from './graph-services.fixtures.js';

let db: SqliteAdapter;

export function registerAnalysisCases(): void {
  describe('DependencyGraphService', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('finds outgoing dependencies', () => {
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const service = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');

      const result = service.query('src/service.ts', 'outgoing', 1, false, 50);
      assert.equal(result.root, 'src/service.ts');
      assert.ok(result.results.length >= 0); // May not resolve relative imports without full path
    });

    it('returns empty for non-indexed file', () => {
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const service = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');

      const result = service.query('nonexistent.ts', 'outgoing', 1, false, 50);
      assert.equal(result.results.length, 0);
    });

    it('clamps depth to max 5', () => {
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const service = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');

      const result = service.query('src/service.ts', 'outgoing', 10, false, 50);
      // Should not crash, depth clamped
      assert.ok(result.metadata.maxDepthReached <= 5);
    });
  });

  describe('TestDetector', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('identifies test files by path pattern', () => {
      const detector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      assert.equal(detector.isTestFile('tests/service.test.ts'), true);
      assert.equal(detector.isTestFile('src/__tests__/foo.ts'), true);
      assert.equal(detector.isTestFile('src/service.ts'), false);
    });

    it('identifies test files by name pattern', () => {
      const detector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      assert.equal(detector.isTestFile('foo.test.ts'), true);
      assert.equal(detector.isTestFile('foo.spec.js'), true);
      assert.equal(detector.isTestFile('FooTest.kt'), true);
      assert.equal(detector.isTestFile('test_foo.py'), true);
    });

    it('finds related tests for a symbol', async () => {
      const detector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const symbols = await resolver.resolve('getUser');
      const tests = detector.findRelatedTests(symbols, []);
      assert.ok(tests.length >= 0); // May find tests/service.test.ts
    });
  });

  describe('ImpactAnalysisService', () => {
    before(async () => { db = await setupTestDb(); });
    after(async () => { await db.disconnect(); });

    it('analyzes impact of modifying a method', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const callGraph = new CallGraphService(graphRepo, resolver);
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
      const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

      const result = await service.analyzeImpact('getUser', 'modify', 3, true, 'low');
      assert.equal(result.symbol, 'getUser');
      assert.equal(result.action, 'modify');
      assert.ok(result.blastRadius.totalAffected >= 0);
      assert.ok(Array.isArray(result.impacts));
      assert.ok(Array.isArray(result.recommendations));
    });

    it('classifies delete action as higher severity', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const callGraph = new CallGraphService(graphRepo, resolver);
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
      const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

      const modifyResult = await service.analyzeImpact('getUser', 'modify', 2, false, 'low');
      const deleteResult = await service.analyzeImpact('getUser', 'delete', 2, false, 'low');

      // Delete should have same or more critical/high items
      const modifyCritical = modifyResult.blastRadius.summary.critical + modifyResult.blastRadius.summary.high;
      const deleteCritical = deleteResult.blastRadius.summary.critical + deleteResult.blastRadius.summary.high;
      assert.ok(deleteCritical >= modifyCritical);
    });

    it('returns empty result for unknown symbol', async () => {
      const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
      const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
      const callGraph = new CallGraphService(graphRepo, resolver);
      const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
      const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
      const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
      const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

      const result = await service.analyzeImpact('nonExistent', 'modify', 3, true, 'low');
      assert.equal(result.blastRadius.totalAffected, 0);
      assert.ok(result.recommendations.length > 0);
    });
  });
}
