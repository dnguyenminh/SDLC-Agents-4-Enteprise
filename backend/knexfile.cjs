/**
 * Knex.js configuration — supports SQLite (staging/dev) and PostgreSQL (production).
 * 
 * Dialect selection via DATABASE_ADAPTER env variable:
 *   - "sqlite"  → uses sql.js (pure JS, no native binding needed)
 *   - "pg"      → uses pg (node-postgres)
 *   - default   → sqlite for development, pg for production
 * 
 * Environment mapping:
 *   - development → SQLite database file (or in-memory if DB_PATH ends with :memory:)
 *   - staging     → SQLite database file from CODE_INTEL_DB or explicit DB_PATH
 *   - production  → PostgreSQL via DATABASE_URL
 */

const path = require('path');
const { resolve } = path;
const ENV = process.env.NODE_ENV || 'development';

// Helper: resolve the SQLite file the SAME way src/config loadConfig() does:
//   codeIntelDir = absolute CODE_INTEL_DATA_DIR, or <cwd>/<DATA_DIR>
//   dbFile       = absolute CODE_INTEL_DB, or <codeIntelDir>/<DB file>
// This keeps manual `npx knex migrate` runs on the same file the dev server uses
// (e.g. CODE_INTEL_DATA_DIR=C:\staging\data + CODE_INTEL_DB=index-staging.db).
function getDbPath() {
  if (ENV === 'production') return null; // PostgreSQL
  const dataDir = process.env.CODE_INTEL_DATA_DIR || '.code-intel';
  const dbFile = process.env.CODE_INTEL_DB || 'index-staging.db';
  if (path.isAbsolute(dbFile)) return dbFile;
  const base = path.isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir);
  return resolve(base, dbFile);
}

// Common table name prefix for migrations tracking
const tableName = 'knex_migrations';

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: getDbPath() || ':memory:',
    },
    useNullAsDefault: true,
    migrations: {
      directory: resolve(__dirname, 'src/database/migrations'),
      tableName,
    },
    seeds: {
      directory: resolve(__dirname, 'src/database/seeds'),
    },
    debug: false,
  },
  staging: {
    client: 'sqlite3',
    connection: {
      filename: getDbPath() || path.resolve(process.cwd(), 'index-staging.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: resolve(__dirname, 'src/database/migrations'),
      tableName,
    },
    seeds: {
      directory: resolve(__dirname, 'src/database/seeds'),
    },
    debug: false,
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'sa4e_db',
      user: process.env.DB_USER || 'sa4e_user',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: resolve(__dirname, 'src/database/migrations'),
      tableName,
    },
    seeds: {
      directory: resolve(__dirname, 'src/database/seeds'),
    },
    schema: 'public',
    debug: false,
  },
};