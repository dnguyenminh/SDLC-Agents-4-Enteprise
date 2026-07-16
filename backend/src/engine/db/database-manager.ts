/**
 * DatabaseManager — SQLite lifecycle management.
 * Handles open, WAL mode, migrations, and graceful close.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { runMigrations, getCurrentVersion } from './migrations.js';
import { resolveNativeBinding, resolveNativeBindingSync } from './resolver/index.js';

const logger = pino({ name: 'database-manager' });

export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly projectId: string;
  private static resolvedBinding: string | undefined | null = null; // null = not yet resolved
  private static sharedDb: Database.Database | null = null;
  private static initPromise: Promise<void> | null = null;

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
    if (DatabaseManager.sharedDb) {
      this.db = DatabaseManager.sharedDb;
      return;
    }

    this.ensureDirectory();

    // Use pre-resolved binding, or try sync resolve as fallback
    const nativeBinding = DatabaseManager.resolvedBinding !== null
      ? DatabaseManager.resolvedBinding
      : resolveNativeBindingSync();

    if (nativeBinding) {
      logger.error(`[db] Using native binding: ${nativeBinding}`);
      this.db = new Database(this.dbPath, { nativeBinding });
    } else {
      logger.error('[db] Using npm-installed better-sqlite3');
      this.db = new Database(this.dbPath);
    }

    this.configureDatabase();
    this.backupBeforeV5();
    runMigrations(this.db, this.projectId);
    DatabaseManager.sharedDb = this.db;
    logger.error(`[db] Initialized at ${this.dbPath}`);
  }

  /**
   * SA4E-41 (TDD §10.3): snapshot the pre-V5 index.db before the multi-tenant
   * migration runs, so a failed migration can be rolled back. Uses VACUUM INTO for
   * a consistent copy (WAL-safe). Skipped for in-memory DBs and when already ≥ V5.
   */
  private backupBeforeV5(): void {
    if (!this.db || this.dbPath === ':memory:') return;
    try {
      if (getCurrentVersion(this.db) >= 5) return;
      const backupPath = `${this.dbPath}.pre-v5.bak`;
      if (fs.existsSync(backupPath)) return; // don't overwrite an existing snapshot
      this.db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      logger.error(`[db] Pre-V5 backup written to ${backupPath}`);
    } catch (err) {
      // Non-fatal: log loudly but let migration proceed (backup is best-effort).
      logger.error({ err }, '[db] Pre-V5 backup failed (continuing with migration)');
    }
  }

  /** Get the underlying database instance. */
  getDb(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /** Close database connection gracefully. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
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
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
  }
}
