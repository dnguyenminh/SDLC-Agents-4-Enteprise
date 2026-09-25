/**
 * admin/db/core.ts — Central database access layer (unified single DB).
 * SA4E-45: getDbAdapter() enables PostgreSQL/MySQL support.
 * SA4E-49: Consolidated into single unified DB file (index.db).
 * SA4E-234: SQLite backed by @sqlite.org/sqlite-wasm (SqliteWasmAdapter) — no
 * native better-sqlite3. The wasm adapter is async-only, so connect + schema
 * init happen in initAdapters() (awaited at startup) via a shared init promise.
 */

import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { loadConfig, getWorkspacePath } from '../../config/index.js';
import { initSchema, seedDefaults } from './schema.js';
import { hashPassword, verifyPassword, generateToken } from './password.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SqliteWasmAdapter } from '../../database/adapters/wasm/SqliteWasmAdapter.js';
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

let sqliteAdapter: SqliteWasmAdapter | null = null;
// Single shared init promise — initAdapters() awaits this same promise so no
// caller (server boot, tests) can race schema creation / admin seeding.
let sqliteReady: Promise<void> | null = null;

/**
 * Get or create the unified SQLite (wasm) adapter singleton (instance only).
 * The instance is created synchronously; connection + schema init happen
 * asynchronously in {@link ensureUnifiedSqliteReady} (awaited by initAdapters()
 * at startup). Callers that run after startup receive a connected adapter.
 */
function getUnifiedSqliteAdapter(): SqliteWasmAdapter {
  if (!sqliteAdapter) {
    sqliteAdapter = new SqliteWasmAdapter(DB_PATH);
  }
  return sqliteAdapter;
}

/**
 * Connect the wasm SQLite adapter and initialize the admin schema.
 * Idempotent: the underlying connect + schema work runs exactly once via the
 * shared sqliteReady promise. MUST be awaited at startup (via initAdapters()).
 * The connect rejection is chained into sqliteReady so a failure surfaces to the
 * awaiting caller instead of becoming an unhandled rejection (SA4E-262).
 */
function ensureUnifiedSqliteReady(): Promise<void> {
  const adapter = getUnifiedSqliteAdapter();
  if (!sqliteReady) {
    sqliteReady = adapter.connect()
      .then(() => initSchema(adapter))
      .then(() => seedDefaults(adapter))
      .catch((err) => { logger.error({ err }, '[admin] SQLite (wasm) schema init failed'); throw err; });
  }
  return sqliteReady;
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
      // Instance is created sync; connection/schema are established by
      // initAdapters() -> ensureUnifiedSqliteReady() at startup. Guarded callers
      // check isConnected(); the init rejection is logged (and rethrown into
      // sqliteReady so initAdapters() sees it).
      dbAdapter = getUnifiedSqliteAdapter();
      void ensureUnifiedSqliteReady().catch((err) => {
        logger.error({ err }, '[admin] Failed to init unified SQLite adapter');
      });
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
 * For SQLite (wasm): awaits connect + schema init/seed. For PostgreSQL/MySQL:
 * awaits pool connection + schema init/seed.
 * @throws Error if connection fails (server should not start)
 */
export async function initAdapters(): Promise<void> {
  const engine = getActiveEngine();
  if (engine === 'sqlite') {
    // Create instance + await wasm connect + schema init/seed (shared promise).
    dbAdapter = getUnifiedSqliteAdapter();
    await ensureUnifiedSqliteReady();
    logger.info({ engine }, '[admin] SQLite (wasm) adapter connected and ready');
    return;
  }

  const configService = new DatabaseConfigService(DATA_DIR);
  const activeConfig = configService.getActiveConfig();
  const adapter = DatabaseAdapterFactory.create(activeConfig);
  await adapter.connect();
  dbAdapter = adapter;

  // Initialize schema and seed defaults for PostgreSQL/MySQL
  try {
    await initSchema(adapter);
    await seedDefaults(adapter);
  } catch (err) {
    logger.error({ err }, '[admin] Failed to init schema/seed defaults');
  }

  logger.info({ engine }, '[admin] DB adapter connected and ready');
}

/** Reset cached DB instance and adapter (used after DB switch/migration) */
export function resetAdminDb(): void {
  dbAdapter = null;
  sqliteReady = null;
  if (sqliteAdapter) {
    void sqliteAdapter.disconnect();
    sqliteAdapter = null;
  }
}

/**
 * Get the unified DatabaseAdapter (backward-compat alias).
 * @deprecated Use getDbAdapter() for new code. Kept for tests.
 * SA4E-262: delegates to getDbAdapter() to honor the unified-DB contract and
 * avoid force-initializing SQLite when the active engine is PostgreSQL.
 */
export function getAdminDb(): DatabaseAdapter {
  return getDbAdapter();
}
