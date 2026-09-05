/**
 * SqliteAsyncAdapter — wraps a raw sqlite3.oo1.DB as AsyncDatabaseAdapter.
 * Zero-overhead: all async methods delegate to sync SQLite calls wrapped in Promise.resolve().
 * SA4E-44: Allows MemoryEngine and other modules to use uniform AsyncDatabaseAdapter interface.
 */

import type { AsyncDatabaseAdapter } from './AsyncDatabaseAdapter.js';
import type { DatabaseEngine, RunResult } from './DatabaseAdapter.js';
import { normalizeSqlitePlaceholders } from './sqlite-placeholders.js';

export class SqliteAsyncAdapter implements AsyncDatabaseAdapter {
  constructor(private readonly db: any) {}

  async connect(): Promise<void> { /* already open */ }
  async disconnect(): Promise<void> { /* managed externally */ }
  isConnected(): boolean { return true; }
  getEngine(): DatabaseEngine { return 'sqlite'; }
  getRawDb(): any { return this.db; }

  private getChanges(): number { return this.db.changes(); }
  private getLastInsertRowid(): number {
    const rows = this.db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
    return Number(rows[0]?.id ?? 0);
  }

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const normalized = normalizeSqlitePlaceholders(sql);
    if (params && params.length > 0) {
      const stmt = this.db.prepare(normalized);
      stmt.bind(params);
      while (stmt.step()) { /* step to exhaust */ }
      const changes = this.getChanges();
      const lastInsertRowid = this.getLastInsertRowid();
      stmt.finalize?.();
      return { changes, lastInsertRowid };
    } else {
      this.db.exec(normalized);
      return { changes: this.getChanges(), lastInsertRowid: this.getLastInsertRowid() };
    }
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const normalized = normalizeSqlitePlaceholders(sql);
    const opts = params && params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
    const rows = this.db.exec(normalized, opts) as any[];
    return rows?.[0] as T | undefined;
  }

  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const normalized = normalizeSqlitePlaceholders(sql);
    const opts = params && params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
    const rows = this.db.exec(normalized, opts) as any[];
    return rows as T[];
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(normalizeSqlitePlaceholders(sql));
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = await fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }
}
