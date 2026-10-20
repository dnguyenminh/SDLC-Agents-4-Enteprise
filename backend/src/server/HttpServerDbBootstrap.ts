/**
 * Startup database bootstrap (extracted from HttpServer.start()).
 * SA4E-101: persistent index-status tables, migrations, stale-op recovery and
 * periodic cleanup scheduling. Failures are non-fatal: progress reporting
 * degrades gracefully (in-memory) instead of blocking server start.
 */

import { getDbAdapter } from '../admin/db/core.js';
import { ensureEngineIndexSchema } from '../database/schema-registry/ensure-engine-schema.js';
import { ensureSa4e101Tables } from '../database/schema-registry/ensure-sa4e-101.js';
import { ensureSa4e300Cleanup } from '../database/schema-registry/ensure-sa4e-300.js';
import { ensureSa4e302UniqueGraphEdges } from '../database/schema-registry/ensure-sa4e-302.js';
import { ensureSa4e303DropUnusedTables } from '../database/schema-registry/ensure-sa4e-303.js';
import {
  runStartupInterruptDetection,
  startInterruptDetectionScheduler,
} from '../engine/indexer/startup-interrupt-detector.js';
import { runMigrations } from '../engine/db/migrations.js';
import { runGraphMigrations } from '../engine/graph/migrator.js';
import { ensurePostgresIndexSchema } from '../database/migration/pg-schema-ensure.js';
import { CleanupScheduler } from '../engine/indexer/cleanup-scheduler.js';
import type { Logger } from 'pino';

/**
 * Run all startup DB work: schema ensure, migrations, pending_tasks rebuild,
 * stale-op interrupt detection and cleanup scheduler start.
 * @returns the started CleanupScheduler (caller owns stopping it), if any.
 */
export async function runDbBootstrap(logger: Logger): Promise<CleanupScheduler | undefined> {
  try {
    await ensureEngineIndexSchema();
    await runEngineMigrations(logger);
    await ensureSa4e101Tables();
    await runStartupInterruptDetection();
    // Periodic re-arm: the boot pass above runs once, so an operation
    // killed <60s before the restart used to stay `running` forever.
    startInterruptDetectionScheduler();
    await ensureSa4e300Cleanup();
    await ensureSa4e302UniqueGraphEdges();
    await ensureSa4e303DropUnusedTables();
    const cleanupScheduler = new CleanupScheduler();
    cleanupScheduler.start();
    return cleanupScheduler;
  } catch (err) {
    logger.error(
      { err },
      '[startup] SA4E-101 persistence init failed — progress will not survive restart',
    );
    return undefined;
  }
}

/** Engine-specific migrations: SQLite rebuilds pending_tasks; PG ensures schema. */
async function runEngineMigrations(logger: Logger): Promise<void> {
  const adapter = getDbAdapter();
  const engine = adapter.getEngine();
  if (engine === 'sqlite') {
    await runMigrations(adapter, process.env.CODE_INTEL_PROJECT_ID || 'default');
    await runGraphMigrations(adapter);
    await rebuildPendingTasksWithoutFk(adapter, logger);
  } else if (engine === 'postgresql') {
    await ensurePostgresIndexSchema(adapter);
  }
}

/**
 * SA4E-171: Recreate pending_tasks without FK to knowledge_entries (SQLite cannot DROP CONSTRAINT)
 * SA4E-266 §3.1: Use INSERT OR REPLACE for atomic migration — no data loss on crash
 */
async function rebuildPendingTasksWithoutFk(
  adapter: ReturnType<typeof getDbAdapter>, logger: Logger,
): Promise<void> {
  try {
    await adapter.allAsync<any>('SELECT id, task_type, entry_id, status, payload, error, retry_count, max_retries, project_id, priority, created_at, started_at, completed_at FROM pending_tasks');
    await adapter.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        entry_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        payload TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        project_id TEXT,
        priority INTEGER DEFAULT 0,
        created_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        UNIQUE (id)
      )
    `);
    await adapter.runAsync(
      'INSERT OR REPLACE INTO pending_tasks_new (id, task_type, entry_id, status, payload, error, retry_count, max_retries, project_id, priority, created_at, started_at, completed_at) SELECT id, task_type, entry_id, status, payload, error, retry_count, max_retries, project_id, priority, created_at, started_at, completed_at FROM pending_tasks',
      []
    );
    await adapter.execAsync(`DROP TABLE IF EXISTS pending_tasks`);
    await adapter.execAsync(`ALTER TABLE pending_tasks_new RENAME TO pending_tasks`);
    logger.info('[startup] pending_tasks migrated with INSERT OR REPLACE');
  } catch (e) {
    logger.warn({ e }, '[startup] pending_tasks migration failed');
  }
}
