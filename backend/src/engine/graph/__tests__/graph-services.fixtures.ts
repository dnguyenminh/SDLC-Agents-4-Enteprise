/**
 * Shared test DB fixture for Graph Services unit tests (KSA-154/155/156/157).
 * Extracted from graph-services.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — fixture relocated.
 */

import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';

export async function setupTestDb(): Promise<SqliteAdapter> {
  const testDb = new SqliteAdapter(':memory:');
  await testDb.connect();
  await testDb.exec(`PRAGMA journal_mode = WAL;`);
  await testDb.exec(`PRAGMA foreign_keys = ON;`);

  // Create schema
  // SA4E-41: tables carry project_id (default 'test_proj') so scoped queries resolve.
  await testDb.exec(`
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
  await testDb.exec(`
    INSERT INTO files (id, path, relative_path, language, content_hash, size_bytes) VALUES
      (1, '/project/src/service.ts', 'src/service.ts', 'typescript', 'hash1', 1000),
      (2, '/project/src/controller.ts', 'src/controller.ts', 'typescript', 'hash2', 800),
      (3, '/project/src/repository.ts', 'src/repository.ts', 'typescript', 'hash3', 600),
      (4, '/project/src/utils.ts', 'src/utils.ts', 'typescript', 'hash4', 400),
      (5, '/project/tests/service.test.ts', 'tests/service.test.ts', 'typescript', 'hash5', 500),
      (6, '/project/src/interface.ts', 'src/interface.ts', 'typescript', 'hash6', 300);
  `);

  // Symbols
  await testDb.exec(`
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
  await testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (5, 'getUser', 2, 'calls', 'src/controller.ts', 12),
      (6, 'createUser', 3, 'calls', 'src/controller.ts', 30),
      (2, 'findById', 8, 'calls', 'src/service.ts', 15),
      (3, 'validateEmail', 10, 'calls', 'src/service.ts', 25),
      (11, 'getUser', 2, 'calls', 'tests/service.test.ts', 10);
  `);

  // Relationships: imports
  await testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (4, './service', NULL, 'imports', 'src/controller.ts', 1),
      (1, './repository', NULL, 'imports', 'src/service.ts', 1),
      (1, './utils', NULL, 'imports', 'src/service.ts', 2),
      (11, '../src/service', NULL, 'imports', 'tests/service.test.ts', 1);
  `);

  // Relationships: implements
  await testDb.exec(`
    INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line) VALUES
      (1, 'IUserService', 12, 'implements', 'src/service.ts', 5);
  `);

  return testDb;
}
