/**
 * WasmSqlitePersistence — file persistence for @sqlite.org/sqlite-wasm in Node.
 *
 * sqlite-wasm in Node is in-memory only (no OPFS). To persist across restarts we
 * serialize the whole DB to a byte array (sqlite3_js_db_export) and write it to
 * disk, then deserialize it back on connect. Writes are debounced so we don't
 * serialize the entire DB on every single statement.
 *
 * Implements: SA4E-33 (SQLite engine), no-workaround (real persistence, not a shim).
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Sqlite3Static, Database } from './wasmTypes.js';

/** Debounce window (ms) for flushing the in-memory DB to disk after a mutation. */
const FLUSH_DEBOUNCE_MS = 250;

/**
 * Manages loading a DB from disk into a wasm in-memory Database and flushing
 * changes back. One instance per adapter/connection.
 */
export class WasmSqlitePersistence {
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private pendingWhileFlushing = false;

  constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly db: Database,
    private readonly dbPath: string,
  ) {}

  /** Whether this persistence targets a real file (not :memory: / anonymous). */
  isFileBacked(): boolean {
    return this.dbPath !== ':memory:' && this.dbPath.trim() !== '';
  }

  /**
   * Deserialize an existing DB file into the wasm Database, if the file exists.
   * Returns true if data was loaded, false for a fresh (empty) database.
   */
  loadFromDisk(): boolean {
    if (!this.isFileBacked() || !fs.existsSync(this.dbPath)) return false;
    const bytes = fs.readFileSync(this.dbPath);
    if (bytes.length === 0) return false;
    const arr = new Uint8Array(bytes);
    const capi = this.sqlite3.capi;
    // Allocate WASM-heap memory owned by SQLite; FREEONCLOSE lets SQLite free it.
    const p = this.sqlite3.wasm.allocFromTypedArray(arr);
    const rc = capi.sqlite3_deserialize(
      this.db, 'main', p, arr.length, arr.length,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    if (rc !== 0) {
      throw new Error(`sqlite3_deserialize failed for ${this.dbPath} (rc=${rc})`);
    }
    return true;
  }

  /** Schedule a debounced flush to disk after a mutation. */
  scheduleFlush(): void {
    if (!this.isFileBacked()) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { void this.flush(); }, FLUSH_DEBOUNCE_MS);
  }

  /**
   * Serialize the current DB and write it to disk atomically (temp file + rename).
   * Coalesces concurrent calls: a flush requested while one is running re-runs after.
   */
  async flush(): Promise<void> {
    if (!this.isFileBacked()) return;
    if (this.flushing) { this.pendingWhileFlushing = true; return; }
    this.flushing = true;
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    try {
    const bytes = this.sqlite3.capi.sqlite3_js_db_export(this.db);
    const dir = path.dirname(this.dbPath);
    try { await fsp.mkdir(dir, { recursive: true }); }
    catch (e: any) { if (e.code !== 'EEXIST' && e.code !== 'ENOENT' && e.code !== 'EPERM') throw e; }
      const tmp = `${this.dbPath}.tmp-${process.pid}-${Date.now()}`;
      try { await fsp.writeFile(tmp, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); }
      catch (e: any) { if (e.code === 'ENOENT' || e.code === 'EPERM') return; throw e; }
      try { await fsp.rename(tmp, this.dbPath); }
      catch (e: any) { if (e.code === 'ENOENT' || e.code === 'EPERM') return; throw e; }
    } finally {
      this.flushing = false;
      if (this.pendingWhileFlushing) {
        this.pendingWhileFlushing = false;
        await this.flush();
      }
    }
  }
}
