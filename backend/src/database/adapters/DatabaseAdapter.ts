/**
 * Database Adapter Interface — Strategy pattern for multi-DB support.
 * Implements: SA4E-33, UC-6, BR-1
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
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  prepare(sql: string): PreparedStatement;
  getEngine(): DatabaseEngine;
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}
