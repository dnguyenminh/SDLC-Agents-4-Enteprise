/**
 * SA4E-45: Resolve the correct DatabaseAdapter for engine-layer modules.
 * SA4E-53 (refactor): No longer requires a pre-opened SQLite handle.
 * Creates the adapter directly from config — SQLite file is only opened
 * when the active engine is actually "sqlite".
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { DatabaseAdapterFactory } from './DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../config/DatabaseConfigService.js';
import { SqliteAdapter } from '../adapters/SqliteAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'resolve-engine-adapter' });

/**
 * Create the active DatabaseAdapter based on admin config.
 * - PostgreSQL/MySQL → creates adapter and connects.
 * - SQLite → opens the SQLite file at dbPath.
 * - Config unavailable → falls back to SQLite at dbPath.
 *
 * @param dataDir - Directory containing database.json (NOT the .db file path)
 * @param dbPath  - SQLite file path — only used when engine is sqlite or as fallback
 */
export async function resolveEngineAdapter(dataDir: string, dbPath: string): Promise<DatabaseAdapter> {
  try {
    const configService = new DatabaseConfigService(dataDir);
    const activeConfig = configService.getActiveConfig();

    if (activeConfig.engine === 'sqlite') {
      logger.info('[engine-adapter] Active engine: sqlite — using SqliteAdapter');
      const adapter = new SqliteAdapter(dbPath);
      await adapter.connect();
      return adapter;
    }

    // Non-SQLite: create adapter via factory (postgresql/mysql)
    logger.info(`[engine-adapter] Active engine: ${activeConfig.engine} — creating adapter`);
    const adapter = DatabaseAdapterFactory.create(activeConfig);
    await adapter.connect();
    logger.info(`[engine-adapter] ${activeConfig.engine} connected successfully`);
    return adapter;
  } catch (err) {
    // Fallback to SQLite if config read or connect fails
    logger.warn({ err }, '[engine-adapter] Failed to connect target DB — falling back to SQLite');
    const fallback = new SqliteAdapter(dbPath);
    await fallback.connect();
    return fallback;
  }
}
