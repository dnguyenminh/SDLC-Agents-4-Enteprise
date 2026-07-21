/**
 * Database Adapter Interface — Strategy pattern for multi-DB support.
 * SA4E-50: Added async variants so PostgresAdapter and SqliteDbAdapter both
 * satisfy a single interface used by admin/db layer.
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

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStatus(): ConnectionStatus;

  // Sync methods — available on SQLite only; throw on PostgreSQL
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  prepare(sql: string): PreparedStatement;

  // SA4E-50: Async variants — work on ALL engines (SQLite delegates to sync)
  runAsync(sql: string, params?: unknown[]): Promise<RunResult>;
  getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execAsync(sql: string): Promise<void>;
  transactionAsync<T>(fn: () => Promise<T>): Promise<T>;

  getEngine(): DatabaseEngine;
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}
