/**
 * Migration 001: Add scope and user_id columns to knowledge_entries.
 * Cross-engine: uses information_schema for PostgreSQL, pragma_table_info for SQLite.
 * 
 * Note: Columns 'scope' and 'user_id' are now created by Knex migration 000.
 * This migration checks if columns exist and skips if already present.
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
    console.debug('[migration-001] SQLite introspection failed:', (err as Error).message);
    return false;
  }
}

export async function migrate001AddScopeColumns(db: DatabaseAdapter): Promise<void> {
  // Skip if columns already exist (created by Knex migration 000)
  if (await columnExists(db, 'knowledge_entries', 'scope')) {
    console.debug('[migration-001] scope column already exists, skipping');
    return;
  }
  if (await columnExists(db, 'knowledge_entries', 'user_id')) {
    console.debug('[migration-001] user_id column already exists, skipping');
    return;
  }

  await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN scope TEXT NOT NULL DEFAULT 'USER'`);
  await db.execAsync(`ALTER TABLE knowledge_entries ADD COLUMN user_id TEXT DEFAULT NULL`);
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_scope ON knowledge_entries(scope)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_user_id ON knowledge_entries(user_id)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ke_scope_user ON knowledge_entries(scope, user_id)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
}