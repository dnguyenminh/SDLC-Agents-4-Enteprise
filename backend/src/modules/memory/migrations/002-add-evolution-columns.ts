/**
 * Migration 002: Add evolution scoring columns and tables.
 * Cross-engine: PostgreSQL + SQLite compatible.
 * Introspection branches on adapter engine (no probe-then-fallback noise).
 * DDL kept in the original cross-engine form (SERIAL tolerated by SQLite,
 * required by PostgreSQL; ON CONFLICT supported by both).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

async function columnExists(db: DatabaseAdapter, table: string, column: string): Promise<boolean> {
  try {
    if (db.getEngine() === 'postgresql') {
      const pg = await db.allAsync<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      );
      return pg.length > 0;
    }
    const lite = await db.allAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}') WHERE name = ?`,
      [column],
    );
    return lite.length > 0;
  } catch (err) {
    console.debug('[migration-002] column introspection failed:', (err as Error).message);
    return false;
  }
}

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  try {
    if (db.getEngine() === 'postgresql') {
      const pg = await db.allAsync<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
        [table],
      );
      return pg.length > 0;
    }
    const lite = await db.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table],
    );
    return lite.length > 0;
  } catch (err) {
    console.debug('[migration-002] table introspection failed:', (err as Error).message);
    return false;
  }
}

export async function migrate002AddEvolutionColumns(db: DatabaseAdapter): Promise<void> {
  if (!await columnExists(db, 'knowledge_entries', 'needs_verification')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0`);
  } else {
    console.debug('[migration-002] needs_verification column already exists, skipping');
  }
  if (!await columnExists(db, 'knowledge_entries', 'epoch_id')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN epoch_id TEXT DEFAULT NULL`);
  } else {
    console.debug('[migration-002] epoch_id column already exists, skipping');
  }
  if (!await columnExists(db, 'knowledge_entries', 'superseded_by')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER DEFAULT NULL`);
  } else {
    console.debug('[migration-002] superseded_by column already exists, skipping');
  }

  if (!await tableExists(db, 'entry_outcomes')) {
    await db.execAsync(`
      CREATE TABLE entry_outcomes (
        id SERIAL PRIMARY KEY,
        entry_id INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'fail', 'partial')),
        agent_name TEXT DEFAULT NULL,
        context TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (current_timestamp),
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
      )
    `);
  } else {
    console.debug('[migration-002] entry_outcomes table already exists, skipping');
  }

  if (!await tableExists(db, 'decay_config')) {
    await db.execAsync(`
      CREATE TABLE decay_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (current_timestamp)
      )
    `);
  } else {
    console.debug('[migration-002] decay_config table already exists, skipping');
  }

  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }

  // INSERT ... ON CONFLICT is supported by both PostgreSQL and SQLite (3.24+).
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('half_life_days', '30') ON CONFLICT (key) DO NOTHING`);
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('enable_predictive', 'false') ON CONFLICT (key) DO NOTHING`);
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('include_superseded', 'false') ON CONFLICT (key) DO NOTHING`);
}
