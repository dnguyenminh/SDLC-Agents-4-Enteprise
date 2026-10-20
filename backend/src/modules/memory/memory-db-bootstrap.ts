/**
 * MemoryModuleBuilder — database bootstrap step.
 * Extracted from MemoryModuleBuilder.ts: adapter resolution, SQLite schema
 * init, versioned migrations and FTS infrastructure (SA4E-45/SA4E-79).
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DatabaseManager } from '../../engine/db/database-manager.js';
import { migrate001AddScopeColumns } from './migrations/001-add-scope-columns.js';
import { migrate002AddEvolutionColumns } from './migrations/002-add-evolution-columns.js';
import { migrate003PendingTasks } from './migrations/003-pending-tasks.js';
import { migrate004ResetSequences } from './migrations/004-reset-sequences.js';
import { migrate005UniqueSourceProject } from './migrations/005-unique-source-project.js';
import { migrate006PendingTasksProjectId } from './migrations/006-pending-tasks-project-id.js';
import { resolveEngineAdapter } from '../../database/factory/resolveEngineAdapter.js';
import type { BuilderConfig } from './MemoryModuleBuilder.js';
import type { MemoryModule } from './MemoryModule.js';

/**
 * Step 1: Open connection and run schema migrations.
 * SA4E-53: DatabaseManager only created for SQLite — Postgres skips SQLite file.
 */
export async function openMemoryDatabase(
  mod: MemoryModule, logger: Logger, config: BuilderConfig,
): Promise<DatabaseAdapter> {
  const dbPath = config.dbPath ?? `${config.dataDir}/memory.db`;
  const injectd = mod.getInjectedDeps();

  // Resolve adapter — only opens SQLite when engine is sqlite
  const injectAdapter = injectd.memAdapter;
  let memAdapter: DatabaseAdapter;
  if (injectAdapter) {
    memAdapter = injectAdapter;
  } else {
    memAdapter = await resolveEngineAdapter(config.dataDir, dbPath);
  }

  await initSqliteSchema(mod, dbPath, memAdapter);
  await runVersionedMigrations(memAdapter, logger);
  await ensurePostgresFts(memAdapter, logger);
  return memAdapter;
}

/** For SQLite: DatabaseManager (WAL etc.) + base memory schema in THIS adapter's view. */
async function initSqliteSchema(
  mod: MemoryModule, dbPath: string, memAdapter: DatabaseAdapter,
): Promise<void> {
  if (memAdapter.getEngine() !== 'sqlite') return;

  const injectd = mod.getInjectedDeps();
  let dbManager: DatabaseManager;
  if (injectd.dbManager) {
    dbManager = injectd.dbManager;
  } else {
    dbManager = new DatabaseManager(dbPath);
    await dbManager.initialize();
  }
  mod.setDbManager(dbManager);

  // Ensure base memory tables exist in THIS adapter's view before versioned
  // migrations. SqliteAdapter works on an in-memory snapshot of the host
  // file, so tables created elsewhere (native driver) may not be visible
  // here on fresh DBs — migrate001 then failed with "no such table:
  // knowledge_entries", leaving the memory module in error and /health
  // at 503 forever (E2E setup timeout). Idempotent (IF NOT EXISTS).
  const { MEMORY_SCHEMA } = await import('./schema/index.js');
  await memAdapter.execAsync(MEMORY_SCHEMA);
}

/** Run versioned migrations via DatabaseAdapter (001–006 + SA4E-79 007). */
async function runVersionedMigrations(memAdapter: DatabaseAdapter, logger: Logger): Promise<void> {
  await migrate001AddScopeColumns(memAdapter);
  await migrate002AddEvolutionColumns(memAdapter);
  await migrate003PendingTasks(memAdapter);
  await migrate004ResetSequences(memAdapter);
  await migrate005UniqueSourceProject(memAdapter);
  await migrate006PendingTasksProjectId(memAdapter);

  // SA4E-79: Add enrichment_status tracking columns
  const { migrate007Up } = await import('./schema/migrations/007_enrichment_status.js');
  await migrate007Up(memAdapter).catch(err => {
    // Column already exists — safe to ignore
    if (!String(err).includes('duplicate column') && !String(err).includes('already exists')) {
      logger.warn({ err }, '[MemoryModuleBuilder] Migration 007 issue (non-fatal)');
    }
  });
}

/** SA4E-45: Ensure PostgreSQL FTS infrastructure exists (tsvector_content + GIN index). */
async function ensurePostgresFts(memAdapter: DatabaseAdapter, logger: Logger): Promise<void> {
  if (memAdapter.getEngine() !== 'postgresql') return;
  const { recreateFtsInfrastructure } = await import('../../database/migration/fts-recreation.js');
  await recreateFtsInfrastructure(memAdapter).catch(err => {
    logger.warn({ err }, '[MemoryModuleBuilder] FTS recreation failed (non-fatal)');
  });
}

/** Step 2b: Rebuild FTS index if empty (SA4E-79 FTS bug fix). */
export async function rebuildFtsIfNeeded(adapter: DatabaseAdapter, logger: Logger): Promise<void> {
  if (adapter.getEngine() !== 'sqlite') return;
  try {
    const count = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_fts',
    );
    if (count && count.cnt > 0) return;
    logger.info('[FTS] knowledge_fts is empty — triggering rebuild from knowledge_entries');
    await adapter.runAsync(
      "INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')",
    );
    const rebuilt = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_fts',
    );
    logger.info({ rebuilt: rebuilt?.cnt ?? 0 }, '[FTS] Rebuild complete');
  } catch (err) {
    logger.warn({ err }, '[FTS] Rebuild failed (non-fatal)');
  }
}
