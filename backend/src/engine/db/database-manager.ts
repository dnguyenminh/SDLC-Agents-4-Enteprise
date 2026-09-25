/**
 * DatabaseManager — SQLite lifecycle management for the indexing engine.
 * Handles open (wasm), migrations, and graceful close.
 * Migrated off better-sqlite3: uses SqliteWasmAdapter (@sqlite.org/sqlite-wasm).
 * The wasm adapter is in-memory in Node and persists to disk by serializing the
 * whole DB, so native-binding resolution and VACUUM-based backups are gone.
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { runMigrations } from './migrations.js';
import { WasmDbSyncAdapter } from '../../database/adapters/wasm/WasmDbSyncAdapter.js';
import { WasmSqliteAdapter } from '../../database/adapters/wasm/SqliteWasmAdapter.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

const logger = pino({ name: 'database-manager' });

export class DatabaseManager {
  private adapter: SqliteWasmAdapter | null = null;
  private readonly dbPath: string;
  private readonly projectId: string;
  private static sharedAdapter: SqliteWasmAdapter | null = null;
  private static sharedReady: Promise<void> | null = null;

  /**
   * @param dbPath  Path to the SQLite index.db file.
   * @param projectId  Booting workspace's derived project id (SA4E-41) — used as
   *                   the legacy backfill value for the V5 multi-tenant migration.
   */
  constructor(dbPath: string, projectId: string = 'default') {
    this.dbPath = dbPath;
    this.projectId = projectId;
  }

  /**
   * Open database (wasm), enable pragmas, run migrations.
   * Async because wasm module init + migrations are async. Idempotent across
   * instances via a shared adapter + shared readiness promise.
   */
  async initialize(): Promise<void> {
    if (DatabaseManager.sharedAdapter) {
      this.adapter = DatabaseManager.sharedAdapter;
      // Ensure the shared init finished before returning.
      if (DatabaseManager.sharedReady) await DatabaseManager.sharedReady;
      return;
    }

    this.ensureDirectory();
    this.adapter = new SqliteWasmAdapter(this.dbPath);
    DatabaseManager.sharedAdapter = this.adapter;
    DatabaseManager.sharedReady = this.bootstrap(this.adapter);
    await DatabaseManager.sharedReady;
    logger.error(`[db] Initialized at ${this.dbPath}`);
  }

  /** Connect, configure pragmas, and run schema migrations (once). */
  private async bootstrap(adapter: SqliteWasmAdapter): Promise<void> {
    await adapter.connect();
    await this.configureDatabase(adapter);
    await runMigrations(adapter, this.projectId);
  }

  /** Get the underlying sync-compatible database handle for engine consumers. */
  getDb(): WasmDbSyncAdapter {
    if (!this.adapter) throw new Error('Database not initialized');
    return new WasmDbSyncAdapter((this.adapter as SqliteWasmAdapter).getDb());
  }

  /** Get the underlying database adapter. */
  getAdapter(): DatabaseAdapter {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter;
  }

  /** Close database connection gracefully (flushes wasm DB to disk). */
  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
      DatabaseManager.sharedAdapter = null;
      DatabaseManager.sharedReady = null;
      logger.error('[db] Connection closed');
    }
  }

  private ensureDirectory(): void {
    if (this.dbPath === ':memory:') return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Apply connection pragmas. For the in-memory wasm engine the durability/cache
   * pragmas that mattered for a native on-disk DB (synchronous, cache_size) are
   * no-ops, so we only set what is meaningful. Kept as a hook for clarity.
   */
  private async configureDatabase(adapter: SqliteWasmAdapter): Promise<void> {
    await adapter.execAsync('PRAGMA temp_store = MEMORY');
  }
}
