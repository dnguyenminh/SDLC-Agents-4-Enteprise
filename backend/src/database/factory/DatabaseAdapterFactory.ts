/**
 * Factory for creating DatabaseAdapter instances based on config.
 * Implements: SA4E-33, BR-1
 */

import type { DatabaseAdapter, DatabaseEngine } from '../adapters/DatabaseAdapter.js';
import { SqliteAdapter } from '../adapters/SqliteAdapter.js';
import { PostgresAdapter, type PostgresConfig } from '../adapters/PostgresAdapter.js';
import { MysqlAdapter, type MysqlConfig } from '../adapters/MysqlAdapter.js';

export interface DatabaseConnectionConfig {
  engine: DatabaseEngine;
  dbPath?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  pool?: { min?: number; max?: number };
}

export class DatabaseAdapterFactory {
  static create(config: DatabaseConnectionConfig): DatabaseAdapter {
    switch (config.engine) {
      case 'sqlite':
        if (!config.dbPath) throw new Error('SQLite requires dbPath');
        return new SqliteAdapter(config.dbPath);

      case 'postgresql':
        return new PostgresAdapter({
          host: config.host || 'localhost',
          port: config.port || 5432,
          username: config.username || '',
          password: config.password || '',
          database: config.database || '',
          ssl: config.ssl || false,
          pool: config.pool,
        } as PostgresConfig);

      case 'mysql':
        return new MysqlAdapter({
          host: config.host || 'localhost',
          port: config.port || 3306,
          username: config.username || '',
          password: config.password || '',
          database: config.database || '',
          ssl: config.ssl || false,
          pool: config.pool,
        } as MysqlConfig);

      default:
        throw new Error(`Unsupported engine: ${config.engine}`);
    }
  }
}
