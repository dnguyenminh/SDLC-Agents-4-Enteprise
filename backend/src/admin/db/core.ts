/**
 * admin/db/core.ts — Central admin database access layer.
 * Provides both raw SQLite handles (legacy) and DatabaseAdapter (multi-DB).
 * SA4E-45: getIndexAdapter() / getAdminAdapter() enable PostgreSQL/MySQL support.
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
const DB_PATH = path.resolve(DATA_DIR, 'admin.db');

export function getIndexDbPath(): string {
  return path.resolve(getWorkspacePath(), config.dataDir, config.sqliteDbPath);
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
 * When engine=sqlite: wraps index.db via SqliteDbAdapter (same behavior as before).
 * When engine=postgresql/mysql: connects to the configured remote DB.
 */
export function getIndexAdapter(): DatabaseAdapter {
  if (!indexAdapter) {
    const engine = getActiveEngine();
    if (engine === 'sqlite') {
      const indexDbPath = getIndexDbPath();
      const dir = path.dirname(indexDbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const indexDb = new Database(indexDbPath);
      indexDb.pragma('journal_mode = WAL');
      indexAdapter = new SqliteDbAdapter(indexDb);
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

/**
 * Get DatabaseAdapter for admin data (users, sessions, graph_nodes, etc.).
 * When engine=sqlite: wraps admin.db via SqliteDbAdapter.
 * When engine=postgresql/mysql: connects to the configured remote DB.
 */
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

/** Reset cached DB instance and adapters (used after DB switch/migration) */
export function resetAdminDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  if (indexAdapter) {
    indexAdapter.disconnect().catch(() => {});
    indexAdapter = null;
  }
  if (adminAdapter) {
    adminAdapter.disconnect().catch(() => {});
    adminAdapter = null;
  }
}
