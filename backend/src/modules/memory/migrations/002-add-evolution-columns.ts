/**
 * Migration 002: Add evolution scoring columns and tables.
 * Supports temporal decay, outcomes, and superseded tracking.
 * MUST be idempotent — checks column/table existence before ALTER/CREATE.
 */
import type Database from 'better-sqlite3';

export function migrate002AddEvolutionColumns(db: Database.Database): void {
  const columns = db.pragma('table_info(knowledge_entries)') as Array<{ name: string }>;
  const colNames = new Set(columns.map(c => c.name));

  if (!colNames.has('needs_verification')) {
    db.exec(`ALTER TABLE knowledge_entries ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0`);
  }
  if (!colNames.has('epoch_id')) {
    db.exec(`ALTER TABLE knowledge_entries ADD COLUMN epoch_id TEXT DEFAULT NULL`);
  }
  if (!colNames.has('superseded_by')) {
    db.exec(`ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER DEFAULT NULL`);
  }

  // Create entry_outcomes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'fail', 'partial')),
      agent_name TEXT DEFAULT NULL,
      context TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    )
  `);

  // Create decay_config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS decay_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count)`);

  // Insert default config rows (ignore if already exist)
  const insertConfig = db.prepare(
    `INSERT OR IGNORE INTO decay_config (key, value) VALUES (?, ?)`,
  );
  insertConfig.run('half_life_days', '30');
  insertConfig.run('enable_predictive', 'false');
  insertConfig.run('include_superseded', 'false');
}
