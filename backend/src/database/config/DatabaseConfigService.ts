/**
 * SA4E-50 — DatabaseConfigService: Manages database configuration via app_config table.
 * Replaces legacy database.json file approach with single-source-of-truth in DB.
 * Implements: SA4E-33, SA4E-50, BR-5, BR-9
 */

import * as path from 'path';
import type Database from 'better-sqlite3';
import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';
import type { DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';
import { AppConfigRepository } from './AppConfigRepository.js';
import { EncryptionService } from './EncryptionService.js';
import { ConfigSerializer } from './ConfigSerializer.js';
import { FileMigrationService } from './FileMigrationService.js';

export interface DatabaseJsonConfig {
  activeEngine: DatabaseEngine;
  engines: {
    sqlite: { dbPath: string };
    postgresql?: ConnectionParams;
    mysql?: ConnectionParams;
  };
  migration: { lastMigration: string | null; backupSqlitePaths: string[] };
}

export interface ConnectionParams {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool: { min: number; max: number };
}

/**
 * Facade for database configuration management.
 * Reads/writes from the app_config table instead of database.json.
 * Handles backward-compatible migration from file on first boot.
 */
export class DatabaseConfigService {
  private readonly repo: AppConfigRepository;
  private readonly encryption: EncryptionService;
  private readonly serializer: ConfigSerializer;
  private readonly migration: FileMigrationService;
  private readonly dataDir: string;

  constructor(db: Database.Database, dataDir: string) {
    this.dataDir = dataDir;
    this.repo = new AppConfigRepository(db);
    this.encryption = new EncryptionService(path.join(dataDir, '.dbkey'));
    this.serializer = new ConfigSerializer(this.encryption);
    this.migration = new FileMigrationService(dataDir, this.repo, this.serializer, this.encryption);
    // Perform one-time migration from database.json if needed
    this.migration.migrateIfNeeded();
  }

  /**
   * Load the full database configuration from app_config table.
   * @returns Structured config with all engine settings
   */
  load(): DatabaseJsonConfig {
    const rows = this.repo.getByPrefix('db.');
    const entries = this.rowsToMap(rows);
    if (!entries['db.activeEngine']) return this.defaultConfig();
    return this.serializer.deserialize(entries);
  }

  /**
   * Save the full database configuration to app_config table.
   * @param config - The structured config to persist
   */
  save(config: DatabaseJsonConfig): void {
    const entries = this.serializer.serialize(config);
    this.repo.setMany(entries);
  }

  /**
   * Get connection config for the currently active engine.
   * @returns Config object suitable for DatabaseAdapterFactory.create()
   */
  getActiveConfig(): DatabaseConnectionConfig {
    const config = this.load();
    switch (config.activeEngine) {
      case 'sqlite':
        return { engine: 'sqlite', dbPath: path.join(this.dataDir, config.engines.sqlite.dbPath) };
      case 'postgresql': {
        const pg = config.engines.postgresql!;
        return { engine: 'postgresql', ...pg };
      }
      case 'mysql': {
        const my = config.engines.mysql!;
        return { engine: 'mysql', ...my };
      }
    }
  }

  /**
   * Switch the active database engine and optionally set connection params.
   * @param engine - Target engine ('sqlite' | 'postgresql' | 'mysql')
   * @param params - Connection parameters (required for postgresql/mysql)
   */
  setActiveEngine(engine: DatabaseEngine, params?: ConnectionParams): void {
    const config = this.load();
    config.activeEngine = engine;
    if (params && engine !== 'sqlite') {
      (config.engines as any)[engine] = params;
    }
    this.save(config);
  }

  private defaultConfig(): DatabaseJsonConfig {
    return {
      activeEngine: 'sqlite',
      engines: { sqlite: { dbPath: 'index.db' } },
      migration: { lastMigration: null, backupSqlitePaths: [] },
    };
  }

  private rowsToMap(rows: { key: string; value: string }[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }
}
