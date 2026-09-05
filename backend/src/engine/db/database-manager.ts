/**
 * DatabaseManager — SQLite lifecycle management for the indexing engine.
 * Handles open, WAL mode, migrations, and graceful close.
 * SA4E-53: Uses SqliteAdapter instead of raw better-sqlite3 import.
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { runMigrations, getCurrentVersion } from './migrations.js';
import { resolveNativeBinding, resolveNativeBindingSync } from './resolver/index.js';
import { SqliteAdapter } from '../../database/adapters/SqliteAdapter.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

const logger = pino({ name: 'database-manager' });

export class DatabaseManager {
  private adapter: SqliteAdapter | null = null;
  private readonly dbPath: string;
  private readonly projectId: string;
  private static resolvedBinding: string | undefined | null = null;
  static sharedAdapter: SqliteAdapter | null = null;

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
   * Pre-resolve native binding (async). Call once at server startup before initialize().
   * Downloads prebuilt binary if needed (standalone mode).
   */
  static async preResolveBinding(): Promise<void> {
    DatabaseManager.resolvedBinding = await resolveNativeBinding();
  }

  /** Open database, enable WAL, run migrations. */
  initialize(): void {
    if (DatabaseManager.sharedAdapter) {
      this.adapter = DatabaseManager.sharedAdapter;
      return;
    }

    this.ensureDirectory();

    // Use pre-resolved binding, or try sync resolve as fallback
    const nativeBinding = DatabaseManager.resolvedBinding !== null
      ? DatabaseManager.resolvedBinding
      : resolveNativeBindingSync();

    if (nativeBinding) {
      logger.error(`[db] Using native binding: ${nativeBinding}`);
    } else {
      logger.error('[db] Using npm-installed better-sqlite3');
    }

    // Create adapter and connect (handles WAL, foreign_keys)
    this.adapter = new SqliteAdapter(this.dbPath, nativeBinding || undefined);
    void this.adapter.connect();
    this.configureDatabase();
    this.backupBeforeV5();
    runMigrations(this.adapter, this.projectId);
    DatabaseManager.sharedAdapter = this.adapter;
    logger.error(`[db] Initialized at ${this.dbPath}`);
  }

  /**
   * SA4E-41 (TDD §10.3): snapshot the pre-V5 index.db before the multi-tenant
   * migration runs. Skipped for in-memory DBs and when already ≥ V5.
   */
  private backupBeforeV5(): void {
    if (!this.adapter || this.dbPath === ':memory:') return;
    try {
      if (getCurrentVersion(this.adapter) >= 5) return;
      const backupPath = `${this.dbPath}.pre-v5.bak`;
      if (fs.existsSync(backupPath)) return;
      this.adapter.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      logger.error(`[db] Pre-V5 backup written to ${backupPath}`);
    } catch (err) {
      logger.error({ err }, '[db] Pre-V5 backup failed (continuing with migration)');
    }
  }

  /** Get the underlying database adapter. */
  getAdapter(): DatabaseAdapter {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter;
  }

  /**
   * Get the raw DB instance.
   * @deprecated Prefer getAdapter() for new code. Kept for backward compat with tests.
   */
  getDb(): any {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter as any;
  }

  /** Close database connection gracefully. */
  close(): void {
    if (this.adapter) {
      void this.adapter.disconnect();
      this.adapter = null;
      DatabaseManager.sharedAdapter = null;
      logger.error('[db] Connection closed');
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private configureDatabase(): void {
    if (!this.adapter) return;
    // Additional pragmas beyond what SqliteAdapter.connect() sets
    this.adapter.exec('PRAGMA synchronous = NORMAL');
    this.adapter.exec('PRAGMA cache_size = -64000');
    this.adapter.exec('PRAGMA temp_store = MEMORY');
  }
}
