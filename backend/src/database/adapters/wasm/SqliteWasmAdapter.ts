/**
 * SqliteWasmAdapter — SQLite engine backed by @sqlite.org/sqlite-wasm.
 *
 * Replaces the previous native adapter. Runs an in-memory wasm SQLite DB
 * and persists to disk by serializing/deserializing the whole database
 * (sqlite-wasm has no OPFS/file VFS under Node). Async-first: sync SQL methods
 * throw "Use xxxAsync", mirroring PostgresAdapter, because wasm init is async.
 *
 * Implements: SA4E-33, BR-1 (default adapter for fresh installs).
 */

import type {
  DatabaseAdapter, DatabaseEngine, RunResult, ConnectionStatus, PreparedStatement,
} from '../DatabaseAdapter.js';
import { normalizeSqlitePlaceholders } from '../sqlite-placeholders.js';
import { getSqlite3 } from './wasmModule.js';
import { WasmSqlitePersistence } from './WasmSqlitePersistence.js';
import type { Sqlite3Static, Database, BindingSpec } from './wasmTypes.js';
import * as path from 'path';

/** SQL bind params must be a flat array of primitive-ish values. */
type Params = unknown[] | undefined;

export class SqliteWasmAdapter implements DatabaseAdapter {
  private sqlite3: Sqlite3Static | null = null;
  private db: Database | null = null;
  private persistence: WasmSqlitePersistence | null = null;
  private connected = false;
  private inTransaction = false;
  /**
   * Root-cause fix for sibling-adapter divergence: each `new SqliteWasmAdapter()`
   * opened a private in-memory DB, so N adapters on the same host file each saw
   * a different database (migrations visible on one, `no such table` on the
   * others). File-backed adapters now share a single live DB per resolved path
   * for the process lifetime (refcounted). `:memory:` adapters stay isolated
   * (unit tests rely on it).
   */
  private static shared: Map<string, { db: Database; persistence: WasmSqlitePersistence; refs: number }> = new Map();
  private sharedKey: string | null = null;

  constructor(private readonly dbPath: string) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.sqlite3 = await getSqlite3();
    const key = this.dbPath === ':memory:' || this.dbPath === '' ? null : path.resolve(this.dbPath);
    // Shared-DB fast path: another adapter already owns the live DB for
    // this file — reuse it so every consumer sees the same tables/rows.
    if (key) {
      const existing = SqliteWasmAdapter.shared.get(key);
      if (existing) {
        this.db = existing.db;
        this.persistence = existing.persistence;
        this.sharedKey = key;
        existing.refs++;
        this.connected = true;
        return;
      }
    }
    // Always open an in-memory DB; disk state (if any) is deserialized in.
    this.db = new this.sqlite3.oo1.DB(':memory:', 'c');
    this.persistence = new WasmSqlitePersistence(this.sqlite3, this.db, this.dbPath);
    this.persistence.loadFromDisk();
    // WAL is irrelevant for in-memory; enforce FK integrity like the old adapter.
    this.db.exec('PRAGMA foreign_keys = ON');
    if (key) {
      SqliteWasmAdapter.shared.set(key, { db: this.db, persistence: this.persistence, refs: 1 });
      this.sharedKey = key;
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.sharedKey) {
      const entry = SqliteWasmAdapter.shared.get(this.sharedKey);
      if (entry) {
        entry.refs--;
        if (entry.refs <= 0) {
          await entry.persistence.flush();
          entry.db.close();
          SqliteWasmAdapter.shared.delete(this.sharedKey);
        }
      }
      this.sharedKey = null;
      this.db = null;
      this.persistence = null;
      this.connected = false;
      return;
    }
    if (this.persistence) await this.persistence.flush();
    if (this.db) { this.db.close(); this.db = null; }
    this.persistence = null;
    this.connected = false;
  }

  isConnected(): boolean { return this.connected; }

  getStatus(): ConnectionStatus {
    if (!this.connected || !this.db) return { connected: false, engine: 'sqlite' };
    return {
      connected: true, engine: 'sqlite', version: 'SQLite 3.x (wasm)',
      details: { path: this.dbPath },
    };
  }

  // --- Sync stubs: not supported (wasm init is async). Use *Async variants. ---
  run(_sql: string, _params?: unknown[]): RunResult { throw new Error('Use runAsync'); }
  get<T = unknown>(_sql: string, _params?: unknown[]): T | undefined { throw new Error('Use getAsync'); }
  all<T = unknown>(_sql: string, _params?: unknown[]): T[] { throw new Error('Use allAsync'); }
  exec(_sql: string): void { throw new Error('Use execAsync'); }
  transaction<T>(_fn: () => T): T { throw new Error('Use transactionAsync'); }
  prepare(_sql: string): PreparedStatement { throw new Error('Use async methods'); }

  // --- Async SQL operations ---

  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> {
    const db = this.getDb();
    db.exec({ sql: normalizeSqlitePlaceholders(sql), bind: this.bind(params) });
    const changes = db.changes();
    // sqlite3_last_insert_rowid returns i64 → BigInt in JS. Convert to Number
    // so downstream JSON.stringify(payload) never throws
    // "Do not know how to serialize a BigInt" (matches old adapter behaviour).
    const lastInsertRowid = Number(this.sqlite3!.capi.sqlite3_last_insert_rowid(db));
    this.markDirty();
    return { changes, lastInsertRowid };
  }

  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const rows = await this.allAsync<T>(sql, params);
    return rows[0];
  }

  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = this.getDb();
    const rows = db.exec({
      sql: normalizeSqlitePlaceholders(sql),
      bind: this.bind(params),
      rowMode: 'object',
      returnValue: 'resultRows',
    });
    return rows as unknown as T[];
  }

  async execAsync(sql: string): Promise<void> {
    this.getDb().exec(sql);
    this.markDirty();
  }

  /**
   * Run fn() inside a transaction. Uses explicit BEGIN/COMMIT/ROLLBACK because
   * the callback performs async adapter calls (the wasm DB's sync .transaction()
   * cannot await). Nested calls reuse the outer transaction (no nested BEGIN).
   */
  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn();
    const db = this.getDb();
    db.exec('BEGIN');
    this.inTransaction = true;
    try {
      const result = await fn();
      db.exec('COMMIT');
      this.markDirty();
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* rollback best-effort */ }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  getEngine(): DatabaseEngine { return 'sqlite'; }

  async getVersion(): Promise<string> {
    const row = await this.getAsync<{ version: string }>('SELECT sqlite_version() as version');
    return `SQLite ${row?.version || 'unknown'}`;
  }

  async getTableNames(): Promise<string[]> {
    const rows = await this.allAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return rows.map((r) => r.name);
  }

  async getRowCount(table: string): Promise<number> {
    const row = await this.getAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return row?.cnt ?? 0;
  }

  /** Force-persist the in-memory DB to disk immediately (e.g. before shutdown). */
  async flush(): Promise<void> {
    if (this.persistence) await this.persistence.flush();
  }

  /**
   * Normalize bind params: undefined -> no binding; empty array -> undefined.
   * The adapter contract passes SQL-bindable primitives; cast to the wasm
   * BindingSpec since the generic `unknown[]` interface can't express that.
   */
  private bind(params: Params): BindingSpec | undefined {
    return params && params.length > 0 ? (params as BindingSpec) : undefined;
  }

  /** Mark the DB dirty; schedule a debounced disk flush unless mid-transaction. */
  private markDirty(): void {
    if (this.inTransaction) return;
    this.persistence?.scheduleFlush();
  }

  getDb(): Database {
    if (!this.db) throw new Error('SQLite (wasm) not connected');
    return this.db;
  }
}
