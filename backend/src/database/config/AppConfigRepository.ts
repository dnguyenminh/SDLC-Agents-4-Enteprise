/**
 * SA4E-50 — AppConfigRepository: Data access layer for the app_config table.
 * Provides get/set/upsert operations for key-value configuration stored in SQLite.
 */

import type Database from 'better-sqlite3';

/** Row shape returned from app_config table */
export interface AppConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

/**
 * Repository for app_config table CRUD operations.
 * Single responsibility: read/write config key-value pairs to/from SQLite.
 */
export class AppConfigRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Get a single config value by key.
   * @param key - The configuration key (e.g. 'db.activeEngine')
   * @returns The value string, or undefined if not found
   */
  get(key: string): string | undefined {
    const row = this.db.prepare(
      'SELECT value FROM app_config WHERE key = ?'
    ).get(key) as { value: string } | undefined;
    return row?.value;
  }

  /**
   * Get all config rows matching a key prefix.
   * @param prefix - Key prefix to match (e.g. 'db.postgresql.')
   * @returns Array of matching config rows
   */
  getByPrefix(prefix: string): AppConfigRow[] {
    return this.db.prepare(
      "SELECT key, value, updated_at FROM app_config WHERE key LIKE ? || '%'"
    ).all(prefix) as AppConfigRow[];
  }

  /**
   * Upsert a single config key-value pair.
   * @param key - The configuration key
   * @param value - The value to store
   */
  set(key: string, value: string): void {
    this.db.prepare(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  }

  /**
   * Upsert multiple config entries in a single transaction.
   * @param entries - Map of key→value pairs to upsert
   */
  setMany(entries: Record<string, string>): void {
    const stmt = this.db.prepare(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        stmt.run(key, value);
      }
    })();
  }

  /**
   * Delete config entries matching a key prefix.
   * @param prefix - Key prefix to delete (e.g. 'db.mysql.')
   */
  deleteByPrefix(prefix: string): void {
    this.db.prepare("DELETE FROM app_config WHERE key LIKE ? || '%'").run(prefix);
  }
}
