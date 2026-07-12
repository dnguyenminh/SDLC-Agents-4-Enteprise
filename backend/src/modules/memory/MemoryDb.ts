/**
 * MemoryDatabaseManager — initializes memory schema on a dedicated SQLite DB.
 * Uses config-driven path (same as admin-db) for data portability.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { MEMORY_SCHEMA } from './schema/index.js';
import { MigrationRunner } from './MigrationRunner.js';
import { loadConfig, getWorkspacePath } from '../../config/BackendConfig.js';

const config = loadConfig();
const DB_PATH = path.resolve(getWorkspacePath(), config.dataDir, config.sqliteDbPath);

let memDb: Database.Database | null = null;

/** Get or create the memory database instance (singleton). */
export function getMemoryDb(): Database.Database {
  if (!memDb) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    memDb = new Database(DB_PATH);
    memDb.pragma('journal_mode = WAL');
    memDb.pragma('foreign_keys = ON');
    initializeSchema(memDb);
  }
  return memDb;
}

/** Close the memory database (for graceful shutdown). */
export function closeMemoryDb(): void {
  if (memDb) {
    memDb.close();
    memDb = null;
  }
}

function initializeSchema(db: Database.Database): void {
  const stmts = MEMORY_SCHEMA.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of stmts) {
    try {
      db.exec(stmt + ';');
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('already exists') || msg.includes('duplicate column')) continue;
      if (msg.includes('no such table') && stmt.includes('fts')) continue;
      throw err;
    }
  }

  // Run versioned migrations (replaces legacy migrateProjectId)
  const runner = new MigrationRunner(db);
  runner.run();
}
