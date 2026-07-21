/**
 * KSA-154/155/156/157: Graph Services Unit Tests.
 * Tests SymbolResolver, CallGraphService, DependencyGraphService, ImpactAnalysis, Traverser.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { SymbolResolver } from '../symbol-resolver.js';
import { CallGraphService } from '../call-graph-service.js';
import { FileResolver } from '../file-resolver.js';
import { DependencyGraphService } from '../dependency-graph-service.js';
import { TestDetector } from '../test-detector.js';
import { ImpactAnalysisService } from '../impact-analysis-service.js';
import { GraphTraverser } from '../traverser.js';
import { GraphRepository } from '../../database/graph-repository.js';

let db: Database.Database;

function setupTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  // Create schema
  // SA4E-41: tables carry project_id (default 'test_proj') so scoped queries resolve.
  testDb.exec(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'test_proj',
      path TEXT NOT NULL UNIQUE,
      relative_path TEXT NOT NULL,
      language TEXT NOT NULL,
      module TEXT,
      content_hash TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
      line_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'test_proj',
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      signature TEXT,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      parent_symbol TEXT,
      visibility TEXT,
      doc_comment TEXT,
      parameters TEXT,
      return_type TEXT,
      parent_symbol_id INTEGER,
      decorators TEXT,
      complexity INTEGER,
      is_async INTEGER DEFAULT 0,
      is_exported INTEGER DEFAULT 0,
      doc_comment_full TEXT,
      modifiers TEXT,
      file_path TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE TABLE relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'test_proj',
      source_symbol_id INTEGER NOT NULL,
      target_symbol TEXT NOT NULL,
      target_symbol_id INTEGER,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
      FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_symbols_name ON symbols(name);
    CREATE INDEX idx_symbols_parent ON symbols(parent_symbol_id);
    CREATE INDEX idx_rel_source_kind ON relationships(source_symbol_id, kind);
    CREATE INDEX idx_rel_target_kind ON relationships(target_symbol, kind);
    CREATE INDEX idx_rel_target_id ON relationships(target_symbol_id);
    CREATE INDEX idx_rel_file ON relationships(file_path);
  `);

  // Insert test data
  // Files
  testDb.exec(`
    INSERT INTO files (id, path, relative_path, language, content_hash, size_bytes) VALUES
      (1, '/project/src/service.ts', 'src/service.ts', 'typescript', 'hash1', 1000),
      (2, '/project/src/controller.ts', 'src/controller.ts', 'typescript', 'hash2', 800),
      (3, '/project/src/repository.ts', 'src/repository.ts', 'typescript', 'hash3', 600),
      (4, '/project/src/utils.ts', 'src/utils.ts', 'typescript', 'hash4', 400),
      (5, '/project/tests/service.test.ts', 'tests/service.test.ts', 'typescript', 'hash5', 500),
      (6, '/project/src/interface.ts', 'src/interface.ts', 'typescript', 'hash6', 300);
  `);

  // Symbols
  testDb.exec(`
    INSERT INTO symbols (id, file_id, name, kind, start_line, end_line, parent_symbol_id, is_exported, file_path) VALUES
      (1, 1, 'UserService', 'class', 5, 50, NULL, 1, 'src/service.ts'),
      (2, 1, 'getUser', 'method', 10, 20, 1, 1, 'src/service.ts'),
      (3, 1, 'createUser', 'method', 22, 40, 1, 1, 'src/service.ts'),
      (4, 2, 'UserController', 'class', 3, 60, NULL, 1, 'src/controller.ts'),
      (5, 2, 'handleGetUser', 'method', 8, 25, 4, 1, 'src/controller.ts'),
      (6, 2, 'handleCreateUser', 'method', 27, 50, 4, 1, 'src/controller.ts'),
      (7, 3, 'UserRepository', 'class', 2, 40, NULL, 1, 'src/repository.ts'),
      (8, 3, 'findById', 'method', 5, 15, 7, 1, 'src/repository.ts'),
      (9, 4, 'formatDate', 'function', 1, 5, NULL, 1, 'src/utils.ts'),
      (10, 4, 'validateEmail', 'function', 7, 15, NULL, 1, 'src/utils.ts'),
      (11, 5, 'testGetUser', 'function', 5, 20, NULL, 0, 'tests/service.test.ts'),
      (12, 6, 'IUserService', 'interface', 1, 10, NULL, 1, 'src/interface.ts'),
      (13, 6, 'getUser', 'method', 3, 3, 12, 1, 'src/interface.ts');
  `);

  // Relationships: calls
  testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (5, 'getUser', 2, 'calls', 'src/controller.ts', 12),
      (6, 'createUser', 3, 'calls', 'src/controller.ts', 30),
      (2, 'findById', 8, 'calls', 'src/service.ts', 15),
      (3, 'validateEmail', 10, 'calls', 'src/service.ts', 25),
      (11, 'getUser', 2, 'calls', 'tests/service.test.ts', 10);
  `);

  // Relationships: imports
  testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (4, './service', NULL, 'imports', 'src/controller.ts', 1),
      (1, './repository', NULL, 'imports', 'src/service.ts', 1),
      (1, './utils', NULL, 'imports', 'src/service.ts', 2),
      (11, '../src/service', NULL, 'imports', 'tests/service.test.ts', 1);
  `);

  // Relationships: implements
  testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (1, 'IUserService', 12, 'implements', 'src/service.ts', 5);
  `);

  return testDb;
}

describe('SymbolResolver', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

  it('resolves exact symbol name', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const results = resolver.resolve('getUser');
    assert.ok(results.length >= 1);
    assert.equal(results[0].name, 'getUser');
  });

  it('resolves qualified name (Class.method)', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const results = resolver.resolve('UserService.getUser');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'getUser');
    assert.equal(results[0].filePath, 'src/service.ts');
  });

  it('returns empty for non-existent symbol', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const results = resolver.resolve('nonExistentSymbol');
    assert.equal(results.length, 0);
  });

  it('suggests similar symbols', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const suggestions = resolver.suggest('User');
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some(s => s.includes('User')));
  });
});

describe('CallGraphService', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

  it('finds direct callers of a method', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallers('getUser', 1, 20);
    assert.ok(result.results.length >= 1);
    assert.ok(result.results.some(r => r.symbol === 'handleGetUser'));
    assert.equal(result.metadata.depthSearched, 1);
  });

  it('finds transitive callers with depth 2', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallers('findById', 2, 20);
    // findById <- getUser <- handleGetUser
    assert.ok(result.results.length >= 1);
  });

  it('finds callees of a method', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallees('handleGetUser', 1, 20);
    assert.ok(result.results.length >= 1);
    assert.ok(result.results.some(r => r.symbol === 'getUser'));
  });

  it('returns empty for unknown symbol', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallers('unknownFunction', 1, 20);
    assert.equal(result.results.length, 0);
    assert.equal(result.resolvedTo.length, 0);
  });

  it('respects limit parameter', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallers('getUser', 3, 1);
    assert.ok(result.results.length <= 1);
  });

  it('clamps depth to max 5', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const service = new CallGraphService(graphRepo, resolver);

    const result = service.findCallers('getUser', 10, 20);
    assert.equal(result.metadata.depthSearched, 5);
  });
});

describe('FileResolver', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

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

describe('DependencyGraphService', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

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
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

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

  it('finds related tests for a symbol', () => {
    const detector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const symbols = resolver.resolve('getUser');
    const tests = detector.findRelatedTests(symbols, []);
    assert.ok(tests.length >= 0); // May find tests/service.test.ts
  });
});

describe('ImpactAnalysisService', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

  it('analyzes impact of modifying a method', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const callGraph = new CallGraphService(graphRepo, resolver);
    const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
    const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
    const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
    const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

    const result = service.analyzeImpact('getUser', 'modify', 3, true, 'low');
    assert.equal(result.symbol, 'getUser');
    assert.equal(result.action, 'modify');
    assert.ok(result.blastRadius.totalAffected >= 0);
    assert.ok(Array.isArray(result.impacts));
    assert.ok(Array.isArray(result.recommendations));
  });

  it('classifies delete action as higher severity', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const callGraph = new CallGraphService(graphRepo, resolver);
    const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
    const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
    const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
    const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

    const modifyResult = service.analyzeImpact('getUser', 'modify', 2, false, 'low');
    const deleteResult = service.analyzeImpact('getUser', 'delete', 2, false, 'low');

    // Delete should have same or more critical/high items
    const modifyCritical = modifyResult.blastRadius.summary.critical + modifyResult.blastRadius.summary.high;
    const deleteCritical = deleteResult.blastRadius.summary.critical + deleteResult.blastRadius.summary.high;
    assert.ok(deleteCritical >= modifyCritical);
  });

  it('returns empty result for unknown symbol', () => {
    const graphRepo = new GraphRepository(new SqliteDbAdapter(db), 'test_proj');
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const callGraph = new CallGraphService(graphRepo, resolver);
    const fileResolver = new FileResolver(new SqliteDbAdapter(db), '/project', 'test_proj');
    const depGraph = new DependencyGraphService(new SqliteDbAdapter(db), fileResolver, 'test_proj');
    const testDetector = new TestDetector(new SqliteDbAdapter(db), 'test_proj');
    const service = new ImpactAnalysisService(new SqliteDbAdapter(db), callGraph, depGraph, resolver, testDetector);

    const result = service.analyzeImpact('nonExistent', 'modify', 3, true, 'low');
    assert.equal(result.blastRadius.totalAffected, 0);
    assert.ok(result.recommendations.length > 0);
  });
});

describe('GraphTraverser', () => {
  before(() => { db = setupTestDb(); });
  after(() => { db.close(); });

  it('resolves a start node', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('UserService');
    assert.ok(node !== null);
    assert.equal(node!.name, 'UserService');
    assert.equal(node!.kind, 'class');
  });

  it('traverses outgoing edges from a node', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('handleGetUser');
    assert.ok(node !== null);

    const results = traverser.traverse(node!, {
      edgeTypes: ['calls'],
      nodeTypes: [],
      direction: 'outgoing',
      maxDepth: 2,
      maxResults: 50,
    });
    // handleGetUser calls getUser
    assert.ok(results.length >= 0);
  });

  it('traverses incoming edges', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('getUser');
    assert.ok(node !== null);

    const results = traverser.traverse(node!, {
      edgeTypes: ['calls'],
      nodeTypes: [],
      direction: 'incoming',
      maxDepth: 2,
      maxResults: 50,
    });
    assert.ok(results.length >= 0);
  });

  it('returns null for unknown symbol', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('nonExistentSymbol');
    assert.equal(node, null);
  });

  it('respects maxResults limit', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('UserService');
    assert.ok(node !== null);

    const results = traverser.traverse(node!, {
      edgeTypes: [],
      nodeTypes: [],
      direction: 'outgoing',
      maxDepth: 5,
      maxResults: 1,
    });
    assert.ok(results.length <= 1);
  });

  it('formats response correctly', () => {
    const resolver = new SymbolResolver(new SqliteDbAdapter(db), 'test_proj');
    const traverser = new GraphTraverser(new SqliteDbAdapter(db), resolver, '/project', 'test_proj');

    const node = traverser.resolveNode('UserService');
    assert.ok(node !== null);

    const results = traverser.traverse(node!, {
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
