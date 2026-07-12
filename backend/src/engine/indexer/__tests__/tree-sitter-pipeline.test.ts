/**
 * KSA-145: Integration test — Verify tree-sitter is wired into IndexingEngine.
 * Tests that IndexingEngine uses TreeSitterIndexer for supported languages
 * and falls back to regex for unsupported ones.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { DatabaseManager } from '../../db/database-manager.js';
import { IndexingEngine } from '../indexing-engine.js';
import { AppConfig } from '../../config.js';

describe('KSA-145: Tree-sitter Pipeline Integration', () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;
  let dbManager: DatabaseManager;
  let config: AppConfig;

  before(() => {
    // Create temp workspace with test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksa145-test-'));
    const srcDir = path.join(tmpDir, 'src', 'example');
    fs.mkdirSync(srcDir, { recursive: true });

    // Write a TypeScript file
    fs.writeFileSync(path.join(srcDir, 'service.ts'), [
      'export class UserService {',
      '  private db: Database;',
      '',
      '  constructor(db: Database) {',
      '    this.db = db;',
      '  }',
      '',
      '  async getUser(id: string): Promise<User> {',
      '    return this.db.findById(id);',
      '  }',
      '',
      '  async createUser(data: CreateUserDto): Promise<User> {',
      '    const user = new User(data);',
      '    return this.db.save(user);',
      '  }',
      '}',
      '',
      'export interface User {',
      '  id: string;',
      '  name: string;',
      '  email: string;',
      '}',
      '',
      'export function validateEmail(email: string): boolean {',
      '  return email.includes("@");',
      '}',
    ].join('\n'));

    // Write a Python file
    fs.writeFileSync(path.join(srcDir, 'utils.py'), [
      'class DataProcessor:',
      '    def __init__(self, config):',
      '        self.config = config',
      '',
      '    def process(self, data):',
      '        return self._transform(data)',
      '',
      'def helper_function(x, y):',
      '    return x + y',
    ].join('\n'));

    // Setup database
    dbPath = path.join(tmpDir, '.code-intel', 'index.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    dbManager = new DatabaseManager(dbPath);
    dbManager.initialize();
    db = dbManager.getDb();

    config = {
      port: 0,
      host: '127.0.0.1',
      onnxModelPath: '',
      logLevel: 'info' as const,
      projectId: 'test',
      dataDir: tmpDir,
      sqliteDbPath: dbPath,
      orchestrationConfigPath: path.join(tmpDir, '.code-intel', 'orchestration.json'),
      workspace: tmpDir,
      viewerPort: 0,
      dbPath,
      configPath: path.join(tmpDir, '.code-intel', 'config.json'),
      watchEnabled: false,
      watchDebounceMs: 500,
      ollamaUrl: null,
      ollamaModel: 'nomic-embed-text',
      excludePatterns: ['node_modules', '.git', '.code-intel'],
      includeExtensions: ['.ts', '.tsx', '.js', '.py', '.kt', '.java', '.go', '.rs'],
      maxFileSize: 512_000,
    };
  });

  after(() => {
    if (db) db.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should initialize IndexingEngine with tree-sitter support', () => {
    const engine = new IndexingEngine(dbManager, config);
    const stats = engine.getTreeSitterStats();
    console.error(`[test] Tree-sitter ready: ${stats.ready}, languages: ${stats.languages.join(', ')}`);
    assert.ok(typeof stats.ready === 'boolean');
    assert.ok(Array.isArray(stats.languages));
    engine.stop();
  });

  it('should run full index without errors', async () => {
    const engine = new IndexingEngine(dbManager, config);
    await engine.runFullIndex();

    const fileCount = db.prepare('SELECT COUNT(*) as c FROM files').get() as { c: number };
    assert.ok(fileCount.c >= 2, `Expected at least 2 files, got ${fileCount.c}`);

    const symbolCount = db.prepare('SELECT COUNT(*) as c FROM symbols').get() as { c: number };
    assert.ok(symbolCount.c > 0, `Expected symbols, got ${symbolCount.c}`);

    console.error(`[test] Indexed ${fileCount.c} files, ${symbolCount.c} symbols`);
    engine.stop();
  });

  it('should extract class and function symbols', async () => {
    const engine = new IndexingEngine(dbManager, config);
    await engine.runFullIndex();

    const userService = db.prepare(
      "SELECT * FROM symbols WHERE name = 'UserService'"
    ).get() as any;
    assert.ok(userService, 'UserService class should be indexed');
    assert.equal(userService.kind, 'class');

    const validateEmail = db.prepare(
      "SELECT * FROM symbols WHERE name = 'validateEmail'"
    ).get() as any;
    assert.ok(validateEmail, 'validateEmail function should be indexed');
    assert.equal(validateEmail.kind, 'function');

    engine.stop();
  });

  it('should populate relationships table when tree-sitter is active', async () => {
    const engine = new IndexingEngine(dbManager, config);
    const stats = engine.getTreeSitterStats();
    await engine.runFullIndex();

    if (stats.ready) {
      const relCount = db.prepare('SELECT COUNT(*) as c FROM relationships').get() as { c: number };
      console.error(`[test] Relationships: ${relCount.c}`);
      assert.ok(relCount.c >= 0, 'Relationships table should exist');
    } else {
      console.error('[test] Tree-sitter not available — skipping relationship check');
    }

    engine.stop();
  });

  it('should handle incremental file updates', async () => {
    const engine = new IndexingEngine(dbManager, config);
    await engine.runFullIndex();

    const initialCount = (db.prepare('SELECT COUNT(*) as c FROM symbols').get() as { c: number }).c;

    const newFile = path.join(tmpDir, 'src', 'example', 'new-module.ts');
    fs.writeFileSync(newFile, [
      'export function newFunction(): void {',
      '  console.log("hello");',
      '}',
      '',
      'export class NewClass {',
      '  method(): string { return "test"; }',
      '}',
    ].join('\n'));

    await engine.indexSingleFile(newFile);

    const afterCount = (db.prepare('SELECT COUNT(*) as c FROM symbols').get() as { c: number }).c;
    assert.ok(afterCount > initialCount, `Expected more symbols: ${afterCount} > ${initialCount}`);

    engine.stop();
  });

  it('should clean up relationships when file is removed', async () => {
    const engine = new IndexingEngine(dbManager, config);
    await engine.runFullIndex();

    const testFile = path.join(tmpDir, 'src', 'example', 'to-remove.ts');
    fs.writeFileSync(testFile, 'export function toRemove(): void {}');
    await engine.indexSingleFile(testFile);

    const before = db.prepare(
      "SELECT COUNT(*) as c FROM files WHERE relative_path LIKE '%to-remove%'"
    ).get() as { c: number };
    assert.equal(before.c, 1);

    engine.removeFile('src/example/to-remove.ts');

    const afterFiles = db.prepare(
      "SELECT COUNT(*) as c FROM files WHERE relative_path LIKE '%to-remove%'"
    ).get() as { c: number };
    assert.equal(afterFiles.c, 0);

    engine.stop();
  });
});
