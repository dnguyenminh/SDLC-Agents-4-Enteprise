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

const DB_PATH = path.resolve(getWorkspacePath(), config.dataDir, 'admin.db');

export function getIndexDbPath(): string {
  return path.resolve(getWorkspacePath(), config.dataDir, config.sqliteDbPath);
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
