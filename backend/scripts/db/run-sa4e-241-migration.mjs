#!/usr/bin/env node
/**
 * SA4E-241 — content_hash index migration runner (TDD §5.3).
 *
 * Applies `sa4e-241-content-hash-index.sql` against the active database.
 * Engine-agnostic: chooses PostgreSQL when DATABASE_URL / DATABASE_ADAPTER=postgresql
 * is set, otherwise falls back to the local SQLite unified DB file.
 *
 * This runner intentionally performs ONLY the additive index DDL. It does NOT
 * touch data: the content_hash re-index (TDD §5.5) is handled organically by the
 * first indexing run after deploy (No-Workaround — no hash backfill/convert).
 *
 * Usage:
 *   node scripts/db/run-sa4e-241-migration.mjs            # auto-detect engine
 *   DATABASE_URL=postgresql://... node scripts/db/run-sa4e-241-migration.mjs
 *   SQLITE_DB_PATH=.code-intel/index.db node scripts/db/run-sa4e-241-migration.mjs
 *
 * Exit code: 0 = applied (or already present), 1 = failure.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(path.join(__dirname, 'sa4e-241-content-hash-index.sql'), 'utf-8');

/** Run the migration against PostgreSQL using the `pg` driver. */
async function runPostgres(connString) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: connString });
  await client.connect();
  try {
    await client.query(SQL);
    console.log('[sa4e-241] Postgres: idx_files_project_content_hash ensured.');
  } finally {
    await client.end();
  }
}

/** Run the migration against the local SQLite unified DB and persist it back. */
async function runSqlite(dbPath) {
  // sql.js is already a backend dependency (no native build needed in CI).
  const initSqlJs = (await import('sql.js')).default;
  const SQLjs = await initSqlJs();
  const buf = readFileSync(dbPath);
  const db = new SQLjs.Database(buf);
  try {
    db.run(SQL);
    // Persist the in-memory image back to disk so the index is durable.
    writeFileSync(dbPath, Buffer.from(db.export()));
    console.log(`[sa4e-241] SQLite (${dbPath}): idx_files_project_content_hash ensured (persisted).`);
  } finally {
    db.close();
  }
}

async function main() {
  const url = process.env.DATABASE_URL || '';
  const adapter = (process.env.DATABASE_ADAPTER || '').toLowerCase();
  const isPostgres = adapter === 'postgresql' || url.startsWith('postgres');

  if (isPostgres && url) {
    await runPostgres(url);
    return;
  }
  const sqlitePath = process.env.SQLITE_DB_PATH || '.code-intel/index.db';
  await runSqlite(sqlitePath);
}

main().catch((err) => {
  console.error('[sa4e-241] migration FAILED:', err.message);
  process.exit(1);
});
