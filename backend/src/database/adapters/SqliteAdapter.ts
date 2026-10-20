/**
 * SQLite Adapter — wraps sql.js with DatabaseAdapter interface.
 * Pure JS, no native bindings. Uses sql.js for in-memory/file SQLite.
 * Implements: SA4E-33, BR-1.
 * Facade (BR-18): persistence in sqlite-persistence.ts, statements in
 * sqlite-statements.ts.
 */

import * as fs from 'fs';
import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';
import { sharedDbs, markSharedDirty, openSqliteDb, closeSqliteDb } from './sqlite-persistence.js';
import {
  sqliteRun, sqliteGet, sqliteAll, sqliteExec, sqliteTransaction, sqlitePrepare,
} from './sqlite-statements.js';

const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default;
const sqlite3 = await sqlite3InitModule();

export class SqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private connected = false;
  private dirty = false;
  private sharedKey: string | null = null;

  constructor(private readonly dbPath: string, private readonly nativeBinding?: string) {}

  private markDirty(): void {
    this.dirty = true;
    if (this.sharedKey) {
      markSharedDirty(this.sharedKey);
    }
  }

  async connect(): Promise<void> {
    if (this.connected && this.db) return;
    try {
      const { db, sharedKey } = await openSqliteDb(this.dbPath, sqlite3);
      this.db = db;
      this.sharedKey = sharedKey;
      this.connected = true;
    } catch (e) {
      this.connected = false;
      this.db = null;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.db) return;
    closeSqliteDb(this.db, this.dbPath, this.sharedKey, this.dirty, sqlite3);
    this.db = null;
    this.sharedKey = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): ConnectionStatus {
    if (!this.connected || !this.db) {
      return { connected: false, engine: 'sqlite' };
    }
    let sizeBytes: number | undefined;
    if (this.dbPath !== ':memory:' && this.dbPath !== '' && fs.existsSync(this.dbPath)) {
      sizeBytes = fs.statSync(this.dbPath).size;
    }
    return {
      connected: true,
      engine: 'sqlite',
      version: 'SQLite 3.x',
      details: { path: this.dbPath, sizeBytes },
    };
  }

  run(sql: string, params?: unknown[]): RunResult {
    return sqliteRun(this.getDb(), sql, params, () => this.markDirty());
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    return sqliteGet<T>(this.getDb(), sql, params);
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    return sqliteAll<T>(this.getDb(), sql, params);
  }

  exec(sql: string): void {
    this.markDirty();
    sqliteExec(this.getDb(), sql);
  }

  transaction<T>(fn: () => T): T {
    return sqliteTransaction(this.getDb(), fn, () => this.markDirty());
  }

  prepare(sql: string): PreparedStatement {
    return sqlitePrepare(this.getDb(), sql, () => this.markDirty());
  }

  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> { return this.run(sql, params); }
  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> { return this.get<T>(sql, params); }
  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> { return this.all<T>(sql, params); }
  async execAsync(sql: string): Promise<void> { this.exec(sql); }
  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  getEngine(): DatabaseEngine {
    return 'sqlite';
  }

  pragma(sql: string): any[] {
    const pragmaSql = sql.trim().toUpperCase().startsWith('PRAGMA') ? sql : `PRAGMA ${sql}`;
    const rows = this.all(pragmaSql);
    return rows as any[];
  }

  async getVersion(): Promise<string> {
    const row = this.get<{ version: string }>('SELECT sqlite_version() as version');
    return `SQLite ${row?.version || 'unknown'}`;
  }

  async getTableNames(): Promise<string[]> {
    const rows = this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    return rows.map((r) => r.name);
  }

  async getRowCount(table: string): Promise<number> {
    const row = this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return row?.cnt ?? 0;
  }

  private getDb(): any {
    if (!this.db) throw new Error('SQLite not connected');
    return this.db;
  }
}
