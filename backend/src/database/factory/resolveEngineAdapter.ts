/**
 * SA4E-45: Resolve the correct DatabaseAdapter for engine-layer modules.
 * Reads active engine from DatabaseConfigService and creates the appropriate adapter.
 * Falls back to SqliteDbAdapter wrapping DatabaseManager if config unavailable.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { DatabaseAdapterFactory } from './DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../config/DatabaseConfigService.js';
import { SqliteDbAdapter } from '../../modules/memory/task-queue/SqliteDbAdapter.js';
import type Database from 'better-sqlite3';
import pino from 'pino';

const logger = pino({ name: 'resolve-engine-adapter' });

/**
 * Create the active DatabaseAdapter for engine modules (async).
 * If admin config says "postgresql" → creates PostgresAdapter and connects.
 * If admin config says "sqlite" or unavailable → wraps given SQLite db.
 *
 * @param sqliteDb - Fallback SQLite database handle (from DatabaseManager)
 * @param dataDir - Data directory containing database.json config
 * @returns Promise resolving to DatabaseAdapter for the active engine
 */
export async function resolveEngineAdapter(sqliteDb: Database.Database, dataDir: string): Promise<DatabaseAdapter> {
  try {
    const configService = new DatabaseConfigService(dataDir);
    const activeConfig = configService.getActiveConfig();

    if (activeConfig.engine === 'sqlite') {
      logger.info('[engine-adapter] Active engine: sqlite — using SqliteDbAdapter');
      return new SqliteDbAdapter(sqliteDb);
    }

    // Non-SQLite: create adapter via factory (postgresql/mysql)
    logger.info(`[engine-adapter] Active engine: ${activeConfig.engine} — creating adapter`);
    const adapter = DatabaseAdapterFactory.create(activeConfig);

    // Properly await async connection
    await adapter.connect();
    logger.info(`[engine-adapter] ${activeConfig.engine} connected successfully`);
    return adapter;
  } catch (err) {
    // Fallback to SQLite if config read or connect fails
    logger.warn({ err }, '[engine-adapter] Failed to connect target DB — falling back to SQLite');
    return new SqliteDbAdapter(sqliteDb);
  }
}
