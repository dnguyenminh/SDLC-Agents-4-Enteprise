/**
 * AsyncDatabaseAdapter — pure-async interface for all DB engines.
 * All methods return Promises, enabling both SQLite (wrapped sync) and PostgreSQL/MySQL (native async).
 * Use this interface in modules that must support multi-engine operation (MemoryModule, analytics, etc.).
 *
 * LSP fix: separates sync-only (SQLite) from async (all engines) contract.
 * Consumers that need sync-only operations should use DatabaseAdapter directly with a runtime engine check.
 */

import type { DatabaseEngine, RunResult } from './DatabaseAdapter.js';

export interface AsyncDatabaseAdapter {
  /** Connect to the database (no-op for SQLite wrapper). */
  connect(): Promise<void>;
  /** Disconnect from the database. */
  disconnect(): Promise<void>;
  /** Check connection status. */
  isConnected(): boolean;
  /** Return the underlying engine type. */
  getEngine(): DatabaseEngine;

  /** Execute INSERT/UPDATE/DELETE — returns changes count + lastInsertRowid. */
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /** Query a single row, or undefined if not found. */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Query all matching rows. */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute raw SQL (DDL, multi-statement). */
  exec(sql: string): Promise<void>;
  /** Execute an async function within a transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
