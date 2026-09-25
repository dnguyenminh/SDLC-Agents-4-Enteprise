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
    return raw.activeEngine || 'sqlite';
  } catch { return 'sqlite'; }
}

/** Get connection config for the active engine */
export function getActiveDbConfig() {
  try {
    const configPath = path.join(DATA_DIR, 'database.json');
    if (!fs.existsSync(configPath)) return { engine: 'sqlite' as const, dbPath: DB_PATH };
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (raw.activeEngine === 'sqlite' || !raw.activeEngine) {
      return { engine: 'sqlite' as const, dbPath: DB_PATH };
    }
    return { engine: raw.activeEngine, ...raw.engines[raw.activeEngine] };
  } catch { return { engine: 'sqlite' as const, dbPath: DB_PATH }; }
}

let sqliteAdapter: SqliteWasmAdapter | null = null;
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
 * Idempotent: the underlying connect + schema work runs exactly once.
 * MUST be awaited at startup (via initAdapters()) before modules use the DB.
 */
async function ensureUnifiedSqliteReady(): Promise<void> {
  const adapter = getUnifiedSqliteAdapter();
  if (!sqliteReady) {
    sqliteReady = (async () => {
      await adapter.connect();
      await initSchema(adapter);
      await seedDefaults(adapter);
    })();
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
      // initAdapters() -> ensureUnifiedSqliteReady() at startup.
      dbAdapter = getUnifiedSqliteAdapter();
      // Best-effort connect if someone resolves the adapter before startup
      // finished (guarded callers check isConnected()).
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
 * For SQLite: instant (sync). For PostgreSQL/MySQL: awaits pool connection.
 * @throws Error if connection fails (server should not start)
 */
export async function initAdapters(): Promise<void> {
  const engine = getActiveEngine();
  if (engine === 'sqlite') {
    // Create instance + await wasm connect + schema init/seed.
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
