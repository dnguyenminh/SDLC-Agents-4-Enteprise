/**
 * Migration 002: Add evolution scoring columns and tables.
 * Cross-engine: PostgreSQL + SQLite compatible.
 * 
 * Note: Several columns/tables are now created by Knex migration 000 or are optional.
 * This migration checks if columns/tables exist and skips if already present.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

async function columnExists(db: DatabaseAdapter, table: string, column: string): Promise<boolean> {
  // SQLite: use pragma_table_info directly (no PG introspection needed)
  try {
    const lite = await db.allAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}') WHERE name = ?`,
      [column],
    );
    return lite.length > 0;
  } catch (err) {
    console.debug('[migration-002] SQLite column introspection failed:', (err as Error).message);
    return false;
  }
}

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  // SQLite: use sqlite_master directly (no PG introspection needed)
  try {
    const lite = await db.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table],
    );
    return lite.length > 0;
  } catch (err) {
    console.debug('[migration-002] SQLite table introspection failed:', (err as Error).message);
    return false;
  }
}

export async function migrate002AddEvolutionColumns(db: DatabaseAdapter): Promise<void> {
  // Skip columns that may already exist from other migrations
  if (await columnExists(db, 'knowledge_entries', 'needs_verification')) {
    console.debug('[migration-002] needs_verification column already exists, skipping');
  } else {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0`);
    console.debug('[migration-002] Added needs_verification column');
  }
  if (await columnExists(db, 'knowledge_entries', 'epoch_id')) {
    console.debug('[migration-002] epoch_id column already exists, skipping');
  } else {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN epoch_id TEXT DEFAULT NULL`);
    console.debug('[migration-002] Added epoch_id column');
  }
  if (await columnExists(db, 'knowledge_entries', 'superseded_by')) {
    console.debug('[migration-002] superseded_by column already exists, skipping');
  } else {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER DEFAULT NULL`);
    console.debug('[migration-002] Added superseded_by column');
  }

  // Create entry_outcomes table if not exists
  if (!await tableExists(db, 'entry_outcomes')) {
    await db.execAsync(`
      CREATE TABLE entry_outcomes (
        id INTEGER PRIMARY KEY,
        entry_id INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        agent_name TEXT DEFAULT NULL,
        context TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
      )
    `);
    console.debug('[migration-002] Created entry_outcomes table');
  } else {
    console.debug('[migration-002] entry_outcomes table already exists, skipping');
  }

  // Create decay_config table if not exists
  if (!await tableExists(db, 'decay_config')) {
    await db.execAsync(`
      CREATE TABLE decay_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Insert default values (INSERT OR IGNORE for SQLite)
    await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('half_life_days', '30')`);
    await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('enable_predictive', 'false')`);
    await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('include_superseded', 'false')`);
    console.debug('[migration-002] Created decay_config table with defaults');
  } else {
    console.debug('[migration-002] decay_config table already exists, skipping');
  }

  // Create indexes if they don't exist (using IF NOT EXISTS equivalent)
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)`); } catch (err) { console.debug('[migration] DDL statement failed:', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at)`); } catch (err) { console.debug('[migration] DDL statement failed:', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)`); } catch (err) { console.debug('[migration] DDL statement failed:', (err as Error).message); }
}