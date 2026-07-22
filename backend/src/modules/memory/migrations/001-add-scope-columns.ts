/**
 * Migration 001: Add scope and user_id columns to knowledge_entries.
 * Cross-engine: uses information_schema for PostgreSQL, pragma_table_info for SQLite.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

async function columnExists(db: DatabaseAdapter, table: string, column: string): Promise<boolean> {
  try {
    // PostgreSQL: information_schema
    const pg = await db.allAsync<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (pg.length > 0) return true;
  } catch {
    // SQLite fallback
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

export async function migrate001AddScopeColumns(db: DatabaseAdapter): Promise<void> {
  if (await columnExists(db, 'knowledge_entries', 'scope')) return;

  await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN scope TEXT NOT NULL DEFAULT 'USER'`);
  await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN user_id TEXT DEFAULT NULL`);
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_scope ON knowledge_entries(scope)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_user_id ON knowledge_entries(user_id)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_scope_user ON knowledge_entries(scope, user_id)`); } catch {}
}
