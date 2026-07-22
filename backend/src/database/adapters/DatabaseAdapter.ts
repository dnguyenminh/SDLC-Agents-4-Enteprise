/**
 * Database Adapter Interfaces — Strategy pattern for multi-DB support.
 * ISP fix: split into 3 focused interfaces, DatabaseAdapter composes all 3.
 *
 * - DatabaseConnectionAdapter: lifecycle (connect/disconnect/status)
 * - SyncDatabaseAdapter: sync SQL ops (SQLite only)
 * - QueryDatabaseAdapter: async SQL ops (all engines)
 * - DatabaseAdapter: composes all + metadata — used by existing consumers
 *
 * Implements: SA4E-33, SA4E-50, UC-6, BR-1
 */

export type DatabaseEngine = 'sqlite' | 'postgresql' | 'mysql';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface ConnectionStatus {
  connected: boolean;
  engine: DatabaseEngine;
  version?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface PreparedStatement {
  run(...params: unknown[]): RunResult;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

/**
 * ISP: Lifecycle management — connect, disconnect, status.
 * All adapters (SQLite, PostgreSQL, MySQL) implement this.
 */
export interface DatabaseConnectionAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStatus(): ConnectionStatus;
  getEngine(): DatabaseEngine;
}

/**
 * ISP: Synchronous SQL operations — SQLite only.
 * PostgreSQL/MySQL adapters throw UnsupportedOperationError on these methods.
 * Use QueryDatabaseAdapter (async) for cross-engine code.
 */
export interface SyncDatabaseAdapter {
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  run(sql: string, params?: unknown[]): RunResult;
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  exec(sql: string): void;
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  transaction<T>(fn: () => T): T;
  /** @throws UnsupportedOperationError on PostgreSQL/MySQL */
  prepare(sql: string): PreparedStatement;
}

/**
 * ISP: Asynchronous SQL operations — all engines.
 * Use this interface when writing cross-engine code.
 */
export interface QueryDatabaseAdapter {
  runAsync(sql: string, params?: unknown[]): Promise<RunResult>;
  getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execAsync(sql: string): Promise<void>;
  transactionAsync<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * ISP: Metadata operations — schema inspection.
 */
export interface MetadataDatabaseAdapter {
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}

/**
 * Full adapter interface — composes all 4 sub-interfaces.
 * Existing consumers can continue using this without change.
 * New consumers should depend on the smallest interface they need.
 */
export interface DatabaseAdapter
  extends DatabaseConnectionAdapter,
    SyncDatabaseAdapter,
    QueryDatabaseAdapter,
    MetadataDatabaseAdapter {}
