/**
 * SqliteDbAdapter — SA4E-44, SA4E-50
 * Wraps an existing better-sqlite3 Database instance as a DatabaseAdapter.
 * SA4E-50: Async variants delegate to sync methods (SQLite is sync anyway),
 * fulfilling the async contract so admin/db layer works with both SQLite and PG.
 */

import type Database from 'better-sqlite3';
import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from '../../../database/adapters/DatabaseAdapter.js';

export class SqliteDbAdapter implements DatabaseAdapter {
  constructor(private readonly db: Database.Database) {}

  async connect(): Promise<void> { /* already connected */ }
  async disconnect(): Promise<void> { /* managed externally */ }
  isConnected(): boolean { return true; }

  getStatus(): ConnectionStatus {
    return { connected: true, engine: 'sqlite' };
  }

  run(sql: string, params?: unknown[]): RunResult {
    const stmt = this.db.prepare(sql);
    const r = params ? stmt.run(...params) : stmt.run();
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  }

  exec(sql: string): void { this.db.exec(sql); }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...p: unknown[]) => {
        const r = stmt.run(...p);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
      },
      get: <T>(...p: unknown[]) => stmt.get(...p) as T | undefined,
      all: <T>(...p: unknown[]) => stmt.all(...p) as T[],
    };
  }

  // SA4E-50: Async variants — SQLite is sync so we simply resolve immediately.
  // This satisfies the DatabaseAdapter async contract without overhead.
  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> {
    return this.run(sql, params);
  }

  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.get<T>(sql, params);
  }

  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.all<T>(sql, params);
  }

  async execAsync(sql: string): Promise<void> {
    this.exec(sql);
  }

  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    // SQLite transactions are sync; we run the async fn and let better-sqlite3
    // handle its own sync calls within. Outer async wrapper provides PG parity.
    return fn();
  }

  getEngine(): DatabaseEngine { return 'sqlite'; }

  async getVersion(): Promise<string> {
    const row = this.get<{ v: string }>('SELECT sqlite_version() as v');
    return `SQLite ${row?.v || 'unknown'}`;
  }

  async getTableNames(): Promise<string[]> {
    const rows = this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    return rows.map(r => r.name);
  }

  async getRowCount(table: string): Promise<number> {
    const row = this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return row?.cnt ?? 0;
  }
}
