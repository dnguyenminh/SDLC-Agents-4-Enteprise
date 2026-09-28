/**
 * Migration 005: Add UNIQUE constraint on (source, project_id) for knowledge_entries.
 * SA4E-163: Enables UPSERT pattern to prevent orphan pending_tasks.
 *
 * Cross-engine: PostgreSQL + SQLite compatible.
 * De-duplicates existing rows BEFORE creating the unique index.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

export async function migrate005UniqueSourceProject(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();

  // Step 1: Check if index already exists (idempotent)
  if (engine === 'postgresql') {
    const existing = await db.allAsync<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_ke_source_project_unique'`,
    );
    if (existing.length > 0) return; // Already applied
  } else {
    const existing = await db.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ke_source_project_unique'`,
    );
    if (existing.length > 0) return;
  }

  // Step 2: De-duplicate — keep only the latest entry per (source, project_id)
  if (engine === 'postgresql') {
    await db.execAsync(`
      DELETE FROM pending_tasks
      WHERE entry_id NOT IN (
        SELECT MAX(id) FROM knowledge_entries
        WHERE source IS NOT NULL
        GROUP BY source, project_id
      ) AND entry_id IN (
        SELECT id FROM knowledge_entries WHERE source IS NOT NULL
      )
    `);
    await db.execAsync(`
      DELETE FROM knowledge_entries
      WHERE id NOT IN (
        SELECT MAX(id) FROM knowledge_entries
        WHERE source IS NOT NULL
        GROUP BY source, project_id
      ) AND source IS NOT NULL
    `);
  } else {
    // Drop stale FTS triggers before delete — they may reference columns added after
    // the FTS table was created, causing "no column named X" errors on DELETE.
    const triggers = await db.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_entries'`,
    );
    for (const { name } of triggers) {
      await db.execAsync(`DROP TRIGGER IF EXISTS "${name}"`);
    }
    await db.execAsync(`
      DELETE FROM knowledge_entries
      WHERE rowid NOT IN (
        SELECT MAX(rowid) FROM knowledge_entries
        WHERE source IS NOT NULL
        GROUP BY source, project_id
      ) AND source IS NOT NULL
    `);
  }

  // Step 3: Create partial unique index
  try {
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ke_source_project_unique
      ON knowledge_entries (source, project_id)
      WHERE source IS NOT NULL
    `);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (!msg.includes('already exists')) throw err;
  }
}
