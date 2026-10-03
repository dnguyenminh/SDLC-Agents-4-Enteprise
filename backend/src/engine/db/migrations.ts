/**
 * Migration runner — sequential, versioned schema migrations.
 * Each migration is applied once and tracked in schema_version table.
 * SA4E-53: Uses QueryDatabaseAdapter instead of a raw Database handle.
 * Versioned step implementations (V1–V4) live in ./migration-steps.js;
 * the V5 multi-tenant step lives in ./migration-v5.js.
 */

import pino from 'pino';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SCHEMA_V1 } from './schema.js';
import { applyMigrationV5 } from './migration-v5.js';
import {
  applyGraphMigrationsSync,
  applyMemorySchema,
  applyMigration,
  applyMigrationV2,
  applyMigrationV4,
  getExistingColumns,
  type Migration,
} from './migration-steps.js';

const logger = pino({ name: 'migrations' });

const MIGRATIONS: Migration[] = [
  { version: 1, description: 'Initial schema with FTS5', sql: SCHEMA_V1 },
];

/** Get current schema version from database. */
export async function getCurrentVersion(db: QueryDatabaseAdapter): Promise<number> {
  try {
    const row = await db.getAsync<{ v: number | null }>(
      'SELECT MAX(version) as v FROM schema_version',
    );
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

/** Run all pending migrations sequentially. */
export async function runMigrations(db: QueryDatabaseAdapter, legacyProjectId: string = 'default'): Promise<void> {
  // Idempotent memory schema execution
  await applyMemorySchema(db);

  // SA4E-42 (PT-01): additive `server` column on mcp_tools.
  await migrateAddMcpToolsServerColumn(db);

  // Provenance columns on files (registerFilesForIndex INSERTs them).
  // Fresh DBs built from SCHEMA_V1 pre-fix lack them because V5's recreate
  // returns early when project_id already exists — so ensure unconditionally.
  await migrateAddFilesProvenanceColumns(db);

  // SA4E-336: repair the body_embeddings upsert index BEFORE the early return so
  // already-migrated DBs (the ones actually failing) get fixed too.
  await ensureBodyEmbeddingsUpsertIndex(db);

  const current = await getCurrentVersion(db);
  const pending = MIGRATIONS.filter(m => m.version > current);

  if (pending.length === 0 && current >= 5) {
    logger.error('[migrations] Schema up to date');
    return;
  }

  for (const migration of pending) {
    logger.error(`[migrations] Applying v${migration.version}: ${migration.description}`);
    await applyMigration(db, migration);
  }

  // Always run V2 column migration (idempotent)
  if (current < 2) {
    await applyMigrationV2(db);
  }

  // Run V3 graph migrations (KSA-145/153/169) — idempotent
  if (current < 3) {
    try {
      await applyGraphMigrationsSync(db);
    } catch (err) {
      logger.error({ err }, '[migrations] V3 graph migration error (graceful):');
    }
  }

  // Run V4 memory table recreation
  if (current < 4) {
    await applyMigrationV4(db);
  }

  // Run V5 multi-tenant isolation (SA4E-41)
  if (current < 5) {
    await applyMigrationV5(db, legacyProjectId);
  }

  // SA4E-336: fresh DBs create body_embeddings in the V3 block above (and V5
  // backfills project_id) — index them once the table definitely exists.
  await ensureBodyEmbeddingsUpsertIndex(db);
}

/**
 * SA4E-42 — add the `server` scoping column to `mcp_tools` for existing DBs.
 * Uses column existence probe instead of a swallow-all catch.
 */
export async function migrateAddMcpToolsServerColumn(db: QueryDatabaseAdapter): Promise<void> {
  const existing = await getExistingColumns(db, 'mcp_tools');
  if (!existing.has('server')) {
    await db.execAsync('ALTER TABLE mcp_tools ADD COLUMN server TEXT');
    logger.error('[migrations] SA4E-42: added mcp_tools.server column');
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)');
}

/**
 * Add file-provenance columns to `files` for existing DBs.
 * Uses column existence probe instead of a swallow-all catch.
 */
export async function migrateAddFilesProvenanceColumns(db: QueryDatabaseAdapter): Promise<void> {
  const existing = await getExistingColumns(db, 'files');
  let added = 0;
  for (const col of ['file_created_at TEXT', 'file_author TEXT', 'file_version TEXT']) {
    const name = col.split(' ')[0];
    if (!existing.has(name)) {
      await db.execAsync(`ALTER TABLE files ADD COLUMN ${col}`);
      added++;
    }
  }
  if (added > 0) logger.error(`[migrations] Added ${added} provenance columns to files`);
}

/**
 * SA4E-336 — `symbol_sync_error` root-cause repair.
 *
 * SQLite built `body_embeddings` with UNIQUE(symbol_id, chunk_index) (V3 DDL and
 * the graph migrator), but PegaSymbolSync.storeBodyEmbedding upserts with
 * ON CONFLICT(project_id, symbol_id, chunk_index). SQLite rejects a conflict
 * target that matches no unique index at statement prepare, so EVERY Pega rule
 * sync threw "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE
 * constraint" and surfaced as `symbol_sync_error` in bulk-check. PostgreSQL
 * already carries this index (SA4E-104, pg-schema-ensure) — SQLite needs the
 * mirror. Safe on existing rows: (symbol_id, chunk_index) uniqueness implies the
 * wider key is unique too. Probe-based and idempotent; SQLite-only (this runner
 * is only invoked for engine === 'sqlite').
 */
export async function ensureBodyEmbeddingsUpsertIndex(db: QueryDatabaseAdapter): Promise<void> {
  const cols = await getExistingColumns(db, 'body_embeddings');
  if (cols.size === 0) return; // table not created yet (V3 / graph migrator create it)
  if (!cols.has('project_id')) {
    // Table predates V5 and V5 never ran — add the scope column the upsert writes.
    await db.execAsync(`ALTER TABLE body_embeddings ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
    logger.error('[migrations] SA4E-336: added body_embeddings.project_id');
  }
  if (await hasBodyEmbeddingsUpsertIndex(db)) return;
  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_body_embeddings_upsert
     ON body_embeddings(project_id, symbol_id, chunk_index)`,
  );
  logger.error('[migrations] SA4E-336: added body_embeddings(project_id, symbol_id, chunk_index) unique index');
}

/** True when a unique index over exactly (project_id, symbol_id, chunk_index) exists. */
async function hasBodyEmbeddingsUpsertIndex(db: QueryDatabaseAdapter): Promise<boolean> {
  const indexes = await db.allAsync<{ name: string; unique: number }>(
    `PRAGMA index_list('body_embeddings')`,
  );
  for (const idx of indexes) {
    if (idx.unique !== 1) continue;
    const cols = await db.allAsync<{ name: string }>(`PRAGMA index_info('${idx.name}')`);
    if (cols.map((c) => c.name).join(',') === 'project_id,symbol_id,chunk_index') return true;
  }
  return false;
}
