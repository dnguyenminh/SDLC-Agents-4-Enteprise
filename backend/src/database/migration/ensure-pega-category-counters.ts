/**
 * ensure-pega-category-counters.ts — Ensure pega_category_counters table exists.
 * SA4E-217: Idempotent table creation, called at server startup.
 *
 * Cross-engine (PostgreSQL + SQLite). Uses the async DatabaseAdapter interface
 * (execAsync) because PostgreSQL adapters reject the sync `exec` with
 * "Use execAsync". The schema matches migrate-pega-category-counters.ts and
 * DiskBackedSet (rule_type as PRIMARY KEY) to avoid schema drift.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

/**
 * Create the pega_category_counters table if missing, using engine-appropriate DDL.
 * @param db Cross-engine database adapter (PostgreSQL or SQLite)
 */
export async function ensurePegaCategoryCountersTable(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();

  // last_updated is a TEXT column in both engines; the default expression differs:
  //   SQLite   → datetime('now')
  //   Postgres → now()::text
  const lastUpdatedDefault = engine === 'postgresql' ? "(now()::text)" : "(datetime('now'))";

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pega_category_counters (
      rule_type TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT ${lastUpdatedDefault},
      source TEXT NOT NULL DEFAULT 'memory'
    )
  `);

  // rule_type is already the PRIMARY KEY (implicitly indexed), but keep an explicit
  // index for clarity/parity across engines. Non-fatal if it already exists.
  try {
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_pega_category_counters_rule_type ON pega_category_counters(rule_type)`,
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.debug('[ensure-pega-category-counters] index already exists or error:', errorMessage);
  }
}
