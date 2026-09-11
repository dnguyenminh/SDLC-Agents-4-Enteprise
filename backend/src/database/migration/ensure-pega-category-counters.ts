/**
 * ensure-pega-category-counters.ts — Ensure pega_category_counters table exists.
 * SA4E-217: Idempotent table creation, called at server startup.
 * Multi-engine: uses the async DatabaseAdapter API + per-engine DDL so it runs on
 * both SQLite and PostgreSQL (PostgresAdapter throws on the sync exec method).
 * Extracted from migrate-pega-category-counters.ts for server-start execution.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

export async function ensurePegaCategoryCountersTable(db: DatabaseAdapter): Promise<void> {
  const isPg = db.getEngine() === 'postgresql';
  // PG: gen_random_uuid() (pgcrypto/pg13+) + now(); SQLite: randomblob UUID + datetime('now').
  const idDefault = isPg
    ? `DEFAULT gen_random_uuid()::text`
    : `DEFAULT (lower(hex(randomblob(4)) || '-' || substr(hex(randomblob(2)) || '4-', 1, 8)) || '-' || substr('89ab', random() % 4 + 1, 1) || '-' || substr(hex(randomblob(2)) || '10', 1, 4)) || '-' || substr(hex(randomblob(6)), 1, 12))`;
  const nowDefault = isPg ? `now()` : `(datetime('now'))`;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pega_category_counters (
      id TEXT PRIMARY KEY ${idDefault},
      rule_type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT ${nowDefault},
      source TEXT NOT NULL DEFAULT 'memory',
      UNIQUE(rule_type)
    )
  `);

  // Ensure index on rule_type (UNIQUE constraint already covers this, but explicit for clarity)
  try {
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pega_category_counters_rule_type ON pega_category_counters(rule_type)`);
  } catch (err) {
    // Index may already exist; ignore in production
    const errorMessage = (err instanceof Error ? err.message : String(err));
    console.debug('[ensure-pega-category-counters] index already exists or error:', errorMessage);
  }
}
