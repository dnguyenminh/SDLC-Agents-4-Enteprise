/**
 * SqliteAsyncAdapter — wraps sync better-sqlite3 Database as AsyncDatabaseAdapter.
 * Zero-overhead: all async methods delegate to sync SQLite calls wrapped in Promise.resolve().
 * SA4E-44: Allows MemoryEngine and other modules to use uniform AsyncDatabaseAdapter interface.
 */

import type Database from 'better-sqlite3';
import type { AsyncDatabaseAdapter } from './AsyncDatabaseAdapter.js';
import type { DatabaseEngine, RunResult } from './DatabaseAdapter.js';

export class SqliteAsyncAdapter implements AsyncDatabaseAdapter {
  constructor(private readonly db: Database.Database) {}

  async connect(): Promise<void> { /* already open */ }
  async disconnect(): Promise<void> { /* managed externally */ }
  isConnected(): boolean { return true; }
  getEngine(): DatabaseEngine { return 'sqlite'; }

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const r = params ? stmt.run(...params) : stmt.run();
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  }

  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // SQLite is sync; run the async fn as-is (better-sqlite3 handles its own sync locking)
    return fn();
  }

  /** Expose raw DB handle for legacy code that still needs sync access. */
  getRawDb(): Database.Database { return this.db; }
}
