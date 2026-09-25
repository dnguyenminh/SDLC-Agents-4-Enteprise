/**
 * ensure-pega-category-counters.ts — Ensure pega_category_counters table exists.
 * SA4E-217: Idempotent table creation, called at server startup.
 * Uses the async QueryDatabaseAdapter interface (execAsync) so it works on the
 * wasm SQLite engine (async-only) and PostgreSQL/MySQL alike.
 *
 * Engine-aware DDL: the `id` surrogate key uses a portable default per engine
 * (PostgreSQL gen_random_uuid(); SQLite hex(randomblob(...))). `rule_type` is the
 * real business key (UNIQUE).
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

/** Detect the active engine via optional getEngine() (full DatabaseAdapter exposes it). */
function detectEngine(db: QueryDatabaseAdapter): string {
  const withEngine = db as unknown as { getEngine?: () => string };
  return typeof withEngine.getEngine === 'function' ? withEngine.getEngine() : 'sqlite';
}

export async function ensurePegaCategoryCountersTable(db: QueryDatabaseAdapter): Promise<void> {
  const engine = detectEngine(db);
  // Portable id default: PostgreSQL uses gen_random_uuid(); SQLite builds a
  // uuid-like value from randomblob(); MySQL uses UUID().
  const idDefault =
    engine === 'postgresql' ? "gen_random_uuid()::text"
      : engine === 'mysql' ? "(UUID())"
        : "(lower(hex(randomblob(16))))";
  const nowDefault = engine === 'postgresql' ? 'NOW()' : "(datetime('now'))";

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pega_category_counters (
      id TEXT PRIMARY KEY DEFAULT ${idDefault},
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
