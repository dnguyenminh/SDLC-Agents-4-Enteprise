/**
 * admin/db/core.ts — Central database access layer (unified single DB).
 * SA4E-45: getDbAdapter() / getDbAdapter() enable PostgreSQL/MySQL support.
 * SA4E-49: Consolidated into single unified DB file (index.db).
 * SA4E-53: Removed raw better-sqlite3 import; uses SqliteAdapter for creation.
 */

import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { loadConfig, getWorkspacePath } from '../../config/index.js';
import { initSchema, seedDefaults } from './schema.js';
import { hashPassword, verifyPassword, generateToken } from './password.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SqliteAdapter } from '../../database/adapters/SqliteAdapter.js';
import { DatabaseAdapterFactory } from '../../database/factory/DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../../database/config/DatabaseConfigService.js';

export { hashPassword, verifyPassword, generateToken };

export const logger = pino({ name: 'admin-db' });

const config = loadConfig();

const DATA_DIR = path.resolve(getWorkspacePath(), config.dataDir);
// SA4E-49: Single unified DB path — all tables in one file.
const DB_PATH = path.resolve(DATA_DIR, config.sqliteDbPath);

/** @deprecated Use DB_PATH directly. Kept for backward compat during migration. */
export function getIndexDbPath(): string {
  return DB_PATH;
}

/** Get active database engine from database.json config */
export function getActiveEngine(): string {
  try {
    const configPath = path.join(DATA_DIR, 'database.json');
    if (!fs.existsSync(configPath)) return 'sqlite';
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Source of truth: per-engine `active` flag. Fallback to legacy activeEngine.
    const engines = raw.engines || {};
    for (const e of ['postgresql', 'mysql', 'sqlite']) {
      if (engines[e] && engines[e].active === true) return e;
    }
    return raw.activeEngine || 'sqlite';
  } catch { return 'sqlite'; }
}

/** Get connection config for the active engine */
export function getActiveDbConfig() {
  try {
    const configPath = path.join(DATA_DIR, 'database.json');
    if (!fs.existsSync(configPath)) return { engine: 'sqlite' as const, dbPath: DB_PATH };
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const engines = raw.engines || {};
    let engine = raw.activeEngine;
    for (const e of ['postgresql', 'mysql', 'sqlite']) {
      if (engines[e] && engines[e].active === true) { engine = e; break; }
    }
    if (engine === 'sqlite' || !engine) {
      return { engine: 'sqlite' as const, dbPath: DB_PATH };
    }
    return { engine, ...engines[engine] };
  } catch { return { engine: 'sqlite' as const, dbPath: DB_PATH }; }
}

let sqliteAdapter: SqliteAdapter | null = null;

/**
 * Get or create the unified SQLite adapter (singleton).
 * Handles directory creation, WAL mode, and schema initialization.
 * Note: SqliteAdapter.connect() is synchronous internally (just wraps sync calls).
 */
function getUnifiedSqliteAdapter(): SqliteAdapter {
  if (!sqliteAdapter) {
    sqliteAdapter = new SqliteAdapter(DB_PATH);
    // SqliteAdapter.connect() is sync internally — safe to call eagerly
    void sqliteAdapter.connect();
    initSchema(sqliteAdapter);
    seedDefaults(sqliteAdapter);
  }
  return sqliteAdapter;
}

// --- DatabaseAdapter layer (multi-DB support) ---

let dbAdapter: DatabaseAdapter | null = null;

/**
 * Get the unified DatabaseAdapter (single instance for all data).
 * SA4E-49: All tables (knowledge_entries, files, symbols, graph_nodes, users,
 * sessions, etc.) live in one database. One adapter, one connection pool.
 */
export function getDbAdapter(): DatabaseAdapter {
  if (!dbAdapter) {
    const engine = getActiveEngine();
    if (engine === 'sqlite') {
      dbAdapter = getUnifiedSqliteAdapter();
    } else {
      const configService = new DatabaseConfigService(DATA_DIR);
      const activeConfig = configService.getActiveConfig();
      dbAdapter = DatabaseAdapterFactory.create(activeConfig);
      dbAdapter.connect().catch((err) => {
        logger.error({ err }, '[admin] Failed to connect DB adapter');
      });
    }
  }
  return dbAdapter;
}



/**
 * Initialize DB adapter and await connection.
 * MUST be called at startup BEFORE any module initialization.
 * For SQLite: instant (sync). For PostgreSQL/MySQL: awaits pool connection.
 * @throws Error if connection fails (server should not start)
 */
export async function initAdapters(): Promise<void> {
  const engine = getActiveEngine();
  if (engine === 'sqlite') {
    getDbAdapter();
    return;
  }

  const configService = new DatabaseConfigService(DATA_DIR);
  const activeConfig = configService.getActiveConfig();
  const adapter = DatabaseAdapterFactory.create(activeConfig);
  await adapter.connect();
  dbAdapter = adapter;

  logger.info({ engine }, '[admin] DB adapter connected and ready');
}

/** Reset cached DB instance and adapter (used after DB switch/migration) */
export function resetAdminDb(): void {
  dbAdapter = null;
  if (sqliteAdapter) {
    void sqliteAdapter.disconnect();
    sqliteAdapter = null;
  }
}

/**
 * Get the raw better-sqlite3 Database instance.
 * @deprecated Use getDbAdapter() for new code. Kept for backward compat with tests.
 */
export function getAdminDb(): import('better-sqlite3').Database {
  const adapter = getUnifiedSqliteAdapter();
  return adapter.getRawDb();
}
