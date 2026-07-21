/**
 * SA4E-50 — ConfigSerializer: Converts between DatabaseJsonConfig and flat key-value pairs.
 * Handles serialization to/from the app_config table format.
 */

import type { DatabaseJsonConfig, ConnectionParams } from './DatabaseConfigService.js';
import type { EncryptionService } from './EncryptionService.js';

/**
 * Serializes/deserializes DatabaseJsonConfig to/from flat key-value map.
 * Encryption is applied transparently to password fields during serialization.
 */
export class ConfigSerializer {
  constructor(private readonly encryption: EncryptionService) {}

  /**
   * Serialize a DatabaseJsonConfig into flat key-value entries for DB storage.
   * Password fields are encrypted before storage.
   * @param config - The structured config object
   * @returns Flat map of key→value pairs ready for app_config table
   */
  serialize(config: DatabaseJsonConfig): Record<string, string> {
    const entries: Record<string, string> = {};
    entries['db.activeEngine'] = config.activeEngine;
    entries['db.sqlite.dbPath'] = config.engines.sqlite.dbPath;
    this.serializeConnectionParams(entries, 'db.postgresql', config.engines.postgresql);
    this.serializeConnectionParams(entries, 'db.mysql', config.engines.mysql);
    this.serializeMigration(entries, config.migration);
    return entries;
  }

  /**
   * Deserialize flat key-value entries from DB into a DatabaseJsonConfig.
   * Password fields are decrypted after retrieval.
   * @param entries - Flat map of key→value from app_config table
   * @returns Structured config object
   */
  deserialize(entries: Record<string, string>): DatabaseJsonConfig {
    return {
      activeEngine: (entries['db.activeEngine'] as any) || 'sqlite',
      engines: {
        sqlite: { dbPath: entries['db.sqlite.dbPath'] || 'index.db' },
        postgresql: this.deserializeConnectionParams(entries, 'db.postgresql'),
        mysql: this.deserializeConnectionParams(entries, 'db.mysql'),
      },
      migration: this.deserializeMigration(entries),
    };
  }

  private serializeConnectionParams(
    entries: Record<string, string>, prefix: string, params?: ConnectionParams
  ): void {
    if (!params) return;
    entries[`${prefix}.host`] = params.host;
    entries[`${prefix}.port`] = String(params.port);
    entries[`${prefix}.username`] = params.username;
    // Encrypt password before storage
    entries[`${prefix}.password`] = this.encryption.encrypt(params.password);
    entries[`${prefix}.database`] = params.database;
    entries[`${prefix}.ssl`] = String(params.ssl);
    entries[`${prefix}.pool.min`] = String(params.pool.min);
    entries[`${prefix}.pool.max`] = String(params.pool.max);
  }

  private deserializeConnectionParams(
    entries: Record<string, string>, prefix: string
  ): ConnectionParams | undefined {
    const host = entries[`${prefix}.host`];
    if (!host) return undefined;
    return {
      host,
      port: parseInt(entries[`${prefix}.port`] || '5432', 10),
      username: entries[`${prefix}.username`] || '',
      // Decrypt password after retrieval
      password: this.encryption.decrypt(entries[`${prefix}.password`] || ''),
      database: entries[`${prefix}.database`] || '',
      ssl: entries[`${prefix}.ssl`] === 'true',
      pool: {
        min: parseInt(entries[`${prefix}.pool.min`] || '2', 10),
        max: parseInt(entries[`${prefix}.pool.max`] || '10', 10),
      },
    };
  }

  private serializeMigration(
    entries: Record<string, string>, migration: DatabaseJsonConfig['migration']
  ): void {
    if (migration.lastMigration) {
      entries['db.migration.lastMigration'] = migration.lastMigration;
    }
    if (migration.backupSqlitePaths.length > 0) {
      entries['db.migration.backupSqlitePaths'] = JSON.stringify(migration.backupSqlitePaths);
    }
  }

  private deserializeMigration(
    entries: Record<string, string>
  ): DatabaseJsonConfig['migration'] {
    const paths = entries['db.migration.backupSqlitePaths'];
    return {
      lastMigration: entries['db.migration.lastMigration'] || null,
      backupSqlitePaths: paths ? JSON.parse(paths) : [],
    };
  }
}
