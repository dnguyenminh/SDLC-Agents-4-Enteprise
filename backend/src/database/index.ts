/**
 * Database module barrel exports.
 * Implements: SA4E-33
 */

export type { DatabaseAdapter, DatabaseEngine, RunResult, ConnectionStatus, PreparedStatement } from './adapters/DatabaseAdapter.js';
export { SqliteAdapter } from './adapters/SqliteAdapter.js';
export { PostgresAdapter } from './adapters/PostgresAdapter.js';
export { MysqlAdapter } from './adapters/MysqlAdapter.js';
export { DatabaseAdapterFactory } from './factory/DatabaseAdapterFactory.js';
export { DatabaseConfigService } from './config/DatabaseConfigService.js';
export { MigrationService } from './migration/MigrationService.js';
export { TypeMapper } from './migration/TypeMapper.js';
export { DialectHelper } from './dialect/DialectHelper.js';

// SA4E-44: Async-only interface and implementations (LSP fix)
export type { AsyncDatabaseAdapter } from './adapters/AsyncDatabaseAdapter.js';
export { SqliteAsyncAdapter } from './adapters/SqliteAsyncAdapter.js';
export { PostgresAsyncAdapter } from './adapters/PostgresAsyncAdapter.js';
