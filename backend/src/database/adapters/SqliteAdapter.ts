/**
 * SQLite Adapter — wraps better-sqlite3 with DatabaseAdapter interface.
 * Default adapter for fresh installations. Zero overhead.
 * Implements: SA4E-33, BR-1
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';

export class SqliteAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private connected = false;

  constructor(private readonly dbPath: string) {}

  async connect(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): ConnectionStatus {
    if (!this.connected || !this.db) {
      return { connected: false, engine: 'sqlite' };
    }
    const stats = fs.statSync(this.dbPath);
    return {
      connected: true,
      engine: 'sqlite',
      version: 'SQLite 3.x',
      details: { path: this.dbPath, sizeBytes: stats.size },
    };
  }

  run(sql: string, params?: unknown[]): RunResult {
    const stmt = this.getDb().prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.getDb().prepare(sql);
    return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.getDb().prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  }

  exec(sql: string): void {
    this.getDb().exec(sql);
  }

  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  prepare(sql: string): PreparedStatement {
    const stmt = this.getDb().prepare(sql);
    return {
      run: (...params: unknown[]) => {
        const r = stmt.run(...params);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
      },
      get: <T>(...params: unknown[]) => stmt.get(...params) as T | undefined,
      all: <T>(...params: unknown[]) => stmt.all(...params) as T[],
    };
  }


  // SA4E-50: Async variants — SQLite is sync so we delegate immediately.
  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> { return this.run(sql, params); }
  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> { return this.get<T>(sql, params); }
  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> { return this.all<T>(sql, params); }
  async execAsync(sql: string): Promise<void> { this.exec(sql); }
  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  getEngine(): DatabaseEngine {
    return 'sqlite';
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

  getRawDb(): Database.Database {
    return this.getDb();
  }

  private getDb(): Database.Database {
    if (!this.db) throw new Error('SQLite not connected');
    return this.db;
  }
}

