import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { loadConfig, getWorkspacePath } from '../../config/index.js';
import { initSchema, seedDefaults } from './schema.js';
import { hashPassword, verifyPassword, generateToken } from './password.js';

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

/** Reset cached DB instance (used after migration to force reconnect) */
export function resetAdminDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
