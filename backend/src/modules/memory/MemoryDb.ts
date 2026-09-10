/**
 * MemoryDatabaseManager — initializes memory schema on a dedicated SQLite DB.
 * Uses config-driven path (same as admin-db) for data portability.
 * SA4E-53: Uses SqliteAdapter instead of raw better-sqlite3.
 */

import * as path from 'path';
import { MEMORY_SCHEMA } from './schema/index.js';
import { MigrationRunner } from './MigrationRunner.js';
import { loadConfig, getWorkspacePath } from '../../config/index.js';
import { SqliteAdapter } from '../../database/adapters/SqliteAdapter.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

const config = loadConfig();
const DB_PATH = path.resolve(getWorkspacePath(), config.dataDir, config.sqliteDbPath);

let memAdapter: SqliteAdapter | null = null;

/** Get or create the memory database adapter instance (singleton). */
export function getMemoryDb(): DatabaseAdapter {
  if (!memAdapter) {
    memAdapter = new SqliteAdapter(DB_PATH);
    void memAdapter.connect();
    initializeSchema(memAdapter);
  }
  return memAdapter;
}

/** Close the memory database (for graceful shutdown). */
export function closeMemoryDb(): void {
  if (memAdapter) {
    void memAdapter.disconnect();
    memAdapter = null;
  }
}

function initializeSchema(adapter: SqliteAdapter): void {
  const stmts = MEMORY_SCHEMA.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of stmts) {
    try {
      adapter.exec(stmt + ';');
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('already exists') || msg.includes('duplicate column')) continue;
      if (msg.includes('no such table') && stmt.includes('fts')) continue;
      throw err;
    }
  }

  // Run versioned migrations (replaces legacy migrateProjectId)
  const runner = new MigrationRunner(adapter);
  runner.run();
}
