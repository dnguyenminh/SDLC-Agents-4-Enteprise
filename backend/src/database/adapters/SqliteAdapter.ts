/**
 * SQLite Adapter — wraps sql.js with DatabaseAdapter interface.
 * Pure JS, no native bindings. Uses sql.js for in-memory/file SQLite.
 * Implements: SA4E-33, BR-1
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';
import { normalizeSqlitePlaceholders } from './sqlite-placeholders.js';

const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default;
const sqlite3 = await sqlite3InitModule();

export class SqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private connected = false;
  private dirty = false;

  constructor(private readonly dbPath: string, private readonly nativeBinding?: string) {}

  async connect(): Promise<void> {
    if (this.connected && this.db) return;
    try {
      if (this.dbPath !== ':memory:' && this.dbPath !== '') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new sqlite3.oo1.DB(this.dbPath || ':memory:');
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.connected = true;
    } catch (e) {
      this.connected = false;
      this.db = null;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      if (this.dbPath !== ':memory:' && this.dbPath !== '' && this.dirty) {
        const data = sqlite3.capi.sqlite3_js_db_export(this.db, 'main');
        fs.writeFileSync(this.dbPath, Buffer.from(data));
      }
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

  private execInternal(sql: string, params?: unknown[]) {
    const normalized = normalizeSqlitePlaceholders(sql);
    this.dirty = true;
    const db = this.getDb();
    if (params && params.length > 0) {
      const stmt = db.prepare(normalized);
      stmt.bind(params);
      while (stmt.step()) { /* step to exhaust */ }
      const changes = db.changes();
      const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
      const lastInsertRowid = Number(rows[0]?.id ?? 0);
      stmt.finalize?.();
      return { changes, lastInsertRowid };
    } else {
      db.exec(normalized);
      const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
      return { changes: db.changes(), lastInsertRowid: Number(rows[0]?.id ?? 0) };
    }
  }

  run(sql: string, params?: unknown[]): RunResult {
    const normalized = normalizeSqlitePlaceholders(sql);
    this.dirty = true;
    const db = this.getDb();
    if (params && params.length) {
      const stmt = db.prepare(normalized);
      stmt.bind(params);
      while (stmt.step()) { /* step to exhaust */ }
      const changes = db.changes();
      const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
      const lastInsertRowid = Number(rows[0]?.id ?? 0);
      stmt.finalize?.();
      return { changes, lastInsertRowid };
    } else {
      db.exec(normalized);
      const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
      return { changes: db.changes(), lastInsertRowid: Number(rows[0]?.id ?? 0) };
    }
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const normalized = normalizeSqlitePlaceholders(sql);
    const opts = params && params.length ? { bind: params, rowMode: 'object' } : { rowMode: 'object' };
    const rows = this.getDb().exec(normalized, opts) as any[];
    return rows?.[0] as T | undefined;
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const normalized = normalizeSqlitePlaceholders(sql);
    const opts = params && params.length ? { bind: params, rowMode: 'object' } : { rowMode: 'object' };
    const rows = this.getDb().exec(normalized, opts) as any[];
    return rows as T[];
  }

  exec(sql: string): void {
    this.dirty = true;
    try {
      this.getDb().exec(normalizeSqlitePlaceholders(sql));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('duplicate column') || msg.includes('duplicate index') || msg.includes('table') && msg.includes('already exists')) {
        return;
      }
      throw e;
    }
  }

  transaction<T>(fn: () => T): T {
    this.dirty = true;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  }

  prepare(sql: string): PreparedStatement {
    const normalized = normalizeSqlitePlaceholders(sql);
    const db = this.getDb();
    return {
      run: (...params: unknown[]) => {
        this.dirty = true;
        const stmt = db.prepare(normalized);
        if (params.length > 0) stmt.bind(params);
        while (stmt.step()) { /* step to exhaust */ }
        const changes = db.changes();
        const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object' }) as any;
        const lastInsertRowid = Number(rows[0]?.id ?? 0);
        stmt.finalize?.();
        return { changes, lastInsertRowid };
      },
      get: <T>(...params: unknown[]) => {
        const opts = params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
        const rows = db.exec(normalized, opts) as any[];
        return rows?.[0] as T | undefined;
      },
      all: <T>(...params: unknown[]) => {
        const opts = params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
        const rows = db.exec(normalized, opts) as any[];
        return rows as T[];
      },
    };
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
