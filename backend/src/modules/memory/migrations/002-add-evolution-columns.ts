/**
 * Migration 002: Add evolution scoring columns and tables.
 * Cross-engine: PostgreSQL + SQLite compatible.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

async function columnExists(db: DatabaseAdapter, table: string, column: string): Promise<boolean> {
  try {
    const pg = await db.allAsync<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (pg.length > 0) return true;
  } catch {
    try {
      const lite = await db.allAsync<{ name: string }>(
        `SELECT name FROM pragma_table_info('${table}') WHERE name = ?`,
        [column],
      );
      return lite.length > 0;
    } catch { return false; }
  }
  return false;
}

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  try {
    // PostgreSQL
    const pg = await db.allAsync<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      [table],
    );
    if (pg.length > 0) return true;
  } catch {
    try {
      const lite = await db.allAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [table],
      );
      return lite.length > 0;
    } catch { return false; }
  }
  return false;
}

export async function migrate002AddEvolutionColumns(db: DatabaseAdapter): Promise<void> {
  if (!await columnExists(db, 'knowledge_entries', 'needs_verification')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0`);
  }
  if (!await columnExists(db, 'knowledge_entries', 'epoch_id')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN epoch_id TEXT DEFAULT NULL`);
  }
  if (!await columnExists(db, 'knowledge_entries', 'superseded_by')) {
    await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER DEFAULT NULL`);
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
  }

  if (!await tableExists(db, 'decay_config')) {
    await db.execAsync(`
      CREATE TABLE decay_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (current_timestamp)
      )
    `);
  }

  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count)`); } catch {}

  // INSERT OR IGNORE is SQLite; use ON CONFLICT for cross-engine
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('half_life_days', '30') ON CONFLICT (key) DO NOTHING`);
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('enable_predictive', 'false') ON CONFLICT (key) DO NOTHING`);
  await db.execAsync(`INSERT INTO decay_config (key, value) VALUES ('include_superseded', 'false') ON CONFLICT (key) DO NOTHING`);
}
