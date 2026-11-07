/**
 * PostgreSQL `modules` column parity — SQLite engine schema
 * (engine/db/schema.ts: modules has 14 columns) vs the PG bootstrap in
 * pg-schema-ensure.ts (only id, project_id, name, path).
 *
 * CREATE TABLE IF NOT EXISTS never adds columns to an existing deployment, so
 * every full index died at updateModules (module-helper.ts) with PG error
 * 42703 `column "root_path" of relation "modules" does not exist`, status
 * flipped to failed at phase `resolving`, and `modules` stayed empty forever.
 *
 * Idempotent (ADD COLUMN / CREATE INDEX IF NOT EXISTS) — called on every boot
 * from ensurePostgresIndexSchema(). PG-only, so SQLite's richer engine schema
 * (created by engine/db/schema.ts) is untouched.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';

/** Consumed by updateModules, detectAndStorePatterns, and query-layer MODULE_COLUMNS. */
const MODULES_COLUMN_ALTERS: readonly string[] = [
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS root_path TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS language TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS file_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS symbol_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS di_style TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS error_handling TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS naming_convention TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS logging_framework TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS testing_framework TEXT`,
  `ALTER TABLE modules ADD COLUMN IF NOT EXISTS purpose TEXT`,
  // Legacy data repair: index runs older than mergeModuleLanguages() (module-helper.ts)
  // wrote one row per (module, language) — a polyglot module ended up with many rows
  // (e.g. 11 rows for `backend`). Those duplicates made the CREATE UNIQUE INDEX below
  // fail on EVERY boot ("Key (project_id, name) is duplicated") and would break any
  // ON CONFLICT(project_id, name) consumer.
  // ORDER MATTERS: the stats UPDATE must run BEFORE the DELETE so the merge can
  // aggregate over ALL per-language rows while they still exist. Each duplicate
  // group gets mergeModuleLanguages semantics (SUM file_count, MAX symbol_count,
  // language of the file-richest variant) on every row, then the DELETE keeps the
  // lowest id as the survivor. Idempotent: no-op when no duplicates exist. PG-only.
  `UPDATE modules m
      SET file_count = s.file_count, symbol_count = s.symbol_count, language = s.language
     FROM (
       SELECT project_id, name,
              SUM(file_count) AS file_count,
              MAX(symbol_count) AS symbol_count,
              (ARRAY_AGG(language ORDER BY file_count DESC))[1] AS language
         FROM modules
        GROUP BY project_id, name
     ) s
    WHERE m.project_id = s.project_id AND m.name = s.name`,
  `DELETE FROM modules a
     USING modules b
    WHERE a.project_id = b.project_id AND a.name = b.name AND a.id > b.id`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_project_name ON modules(project_id, name)`,
];

/** Bring an existing PG `modules` table to full engine-schema parity (idempotent). */
export async function ensureModulesSchema(adapter: DatabaseAdapter): Promise<void> {
  for (const sql of MODULES_COLUMN_ALTERS) {
    try {
      await adapter.runAsync(sql, []);
    } catch {
      // Redundant/unsupported statement — keep booting (same policy as safeExec).
    }
  }
}
