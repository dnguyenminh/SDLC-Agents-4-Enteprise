/**
 * admin/db/core.ts — Central database access layer (unified single DB).
 * SA4E-45: getIndexAdapter() / getAdminAdapter() enable PostgreSQL/MySQL support.
 * SA4E-49: Consolidated into single unified DB file (index.db) — admin tables
 *          (users, graph_nodes) live alongside index tables (knowledge_entries, symbols).
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { loadConfig, getWorkspacePath } from '../../config/index.js';
import { initSchema, seedDefaults } from './schema.js';
import { hashPassword, verifyPassword, generateToken } from './password.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SqliteDbAdapter } from '../../modules/memory/task-queue/SqliteDbAdapter.js';
import { DatabaseAdapterFactory } from '../../database/factory/DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../../database/config/DatabaseConfigService.js';

export { hashPassword, verifyPassword, generateToken };

export const logger = pino({ name: 'admin-db' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
    if (raw.activeEngine === 'sqlite' || !raw.activeEngine) return { engine: 'sqlite' as const, dbPath: DB_PATH };
    return { engine: raw.activeEngine, ...raw.engines[raw.activeEngine] };
  } catch { return { engine: 'sqlite' as const, dbPath: DB_PATH }; }
}

let db: Database.Database | null = null;

export function getAdminDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    seedDefaults(db);
  }
  return db;
}

// --- DatabaseAdapter layer (multi-DB support) ---

let indexAdapter: DatabaseAdapter | null = null;
let adminAdapter: DatabaseAdapter | null = null;

/**
 * Get DatabaseAdapter for index data (knowledge_entries, files, symbols, etc.).
 * SA4E-49: Now shares the same unified DB as admin tables.
 * When engine=sqlite: wraps the unified DB via SqliteDbAdapter.
 * When engine=postgresql/mysql: connects to the configured remote DB.
 */
export function getIndexAdapter(): DatabaseAdapter {
  if (!indexAdapter) {
    const engine = getActiveEngine();
    if (engine === 'sqlite') {
      indexAdapter = new SqliteDbAdapter(getAdminDb());
    } else {
      const configService = new DatabaseConfigService(DATA_DIR);
      const activeConfig = configService.getActiveConfig();
      indexAdapter = DatabaseAdapterFactory.create(activeConfig);
      indexAdapter.connect().catch((err) => {
        logger.error({ err }, '[admin] Failed to connect index adapter');
      });
    }
  }
  return indexAdapter;
}

export function getAdminAdapter(): DatabaseAdapter {
  if (!adminAdapter) {
    const engine = getActiveEngine();
    if (engine === 'sqlite') {
      adminAdapter = new SqliteDbAdapter(getAdminDb());
    } else {
      const configService = new DatabaseConfigService(DATA_DIR);
      const activeConfig = configService.getActiveConfig();
      adminAdapter = DatabaseAdapterFactory.create(activeConfig);
      adminAdapter.connect().catch((err) => {
        logger.error({ err }, '[admin] Failed to connect admin adapter');
      });
    }
  }
  return adminAdapter;
}

/**
 * Initialize DB adapters and await connection.
 * MUST be called at startup BEFORE any module initialization.
 * For SQLite: instant (sync). For PostgreSQL/MySQL: awaits pool connection.
 * @throws Error if connection fails (server should not start)
 */
export async function initAdapters(): Promise<void> {
  const engine = getActiveEngine();
  if (engine === 'sqlite') {
    // SQLite: create adapters synchronously — nothing async to await
    getIndexAdapter();
    getAdminAdapter();
    return;
  }

  const configService = new DatabaseConfigService(DATA_DIR);
  const activeConfig = configService.getActiveConfig();

  // Create and await both adapters in parallel
  const idx = DatabaseAdapterFactory.create(activeConfig);
  const adm = DatabaseAdapterFactory.create(activeConfig);

  await Promise.all([idx.connect(), adm.connect()]);

  // Cache after successful connection
  indexAdapter = idx;
  adminAdapter = adm;

  logger.info({ engine }, '[admin] DB adapters connected and ready');
}

/** Reset cached DB instance and adapters (used after DB switch/migration) */
export function resetAdminDb(): void {
  // SA4E-49: indexAdapter shares the same DB handle, clear references first.
  indexAdapter = null;
  adminAdapter = null;
  if (db) {
    db.close();
    db = null;
  }
}
