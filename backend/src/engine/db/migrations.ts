/**
 * Migration runner — sequential, versioned schema migrations.
 * Each migration is applied once and tracked in schema_version table.
 */

import Database from 'better-sqlite3';
import pino from 'pino';
import { SCHEMA_V1 } from './schema.js';
import { runGraphMigrations } from '../database/migrator.js';

const logger = pino({ name: 'migrations' });

function applyMemorySchema(db: Database.Database): void {
  try {
    db.exec(SCHEMA_V1);
  } catch (err) {
    logger.error({ err }, '[migrations] Memory schema error (graceful):');
  }
}

interface Migration {
  version: number;
  description: string;
  sql: string;
}

/** Pattern metadata columns added in V2. */
const MIGRATION_V2_COLUMNS = [
  'di_style',
  'error_handling',
  'naming_convention',
  'logging_framework',
  'testing_framework',
  'purpose',
] as const;

const MIGRATIONS: Migration[] = [
  { version: 1, description: 'Initial schema with FTS5', sql: SCHEMA_V1 },
];

/** Get current schema version from database. */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      'SELECT MAX(version) as v FROM schema_version'
    ).get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

/** Run all pending migrations sequentially. */
export function runMigrations(db: Database.Database): void {
  // Idempotent memory schema execution
  applyMemorySchema(db);

  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter(m => m.version > current);

  if (pending.length === 0 && current >= 2) {
    logger.error('[migrations] Schema up to date');
    return;
  }

  for (const migration of pending) {
    logger.error(`[migrations] Applying v${migration.version}: ${migration.description}`);
    applyMigration(db, migration);
  }

  // Always run V2 column migration (idempotent)
  if (current < 2) {
    applyMigrationV2(db);
  }

  // Run V3 graph migrations (KSA-145/153/169) — idempotent
  if (current < 3) {
    try {
      runGraphMigrations(db);
    } catch (err) {
      logger.error({ err }, '[migrations] V3 graph migration error (graceful):');
    }
  }

  // Run V4 memory table recreation
  if (current < 4) {
    applyMigrationV4(db);
  }
}

function applyMigrationV4(db: Database.Database): void {
  try {
    const memoryTables = [
      'knowledge_entries',
      'knowledge_vectors',
      'knowledge_graph_edges',
      'consolidation_log',
      'memory_sessions',
      'memory_audit',
      'conversation_turns',
      'entity_index',
      'agent_scope_config',
      'quality_scores',
      'tags',
      'entry_tags',
      'citations',
      'attachments',
      'templates',
      'feedback',
      'reminders',
      'search_log',
      'popular_queries',
      'knowledge_fts'
    ];

    db.exec('PRAGMA foreign_keys=OFF;');
    for (const table of memoryTables) {
      db.exec(`DROP TABLE IF EXISTS ${table};`);
    }
    db.exec('PRAGMA foreign_keys=ON;');

    // Re-apply memory schema to create the new tables
    applyMemorySchema(db);

    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(4);
    logger.error('[migrations] V4: Memory tables dropped and recreated with full schema');
  } catch (err) {
    logger.error({ err }, `[migrations] V4 error:`);
  }
}

function applyMigration(db: Database.Database, migration: Migration): void {
  db.exec(migration.sql);
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
  logger.error(`[migrations] v${migration.version} applied`);
}

/** Migration V2 — Add pattern metadata columns to modules table. */
function applyMigrationV2(db: Database.Database): void {
  try {
    const existing = getExistingColumns(db, 'modules');
    let added = 0;

    for (const col of MIGRATION_V2_COLUMNS) {
      if (!existing.has(col)) {
        db.exec(`ALTER TABLE modules ADD COLUMN ${col} TEXT DEFAULT NULL`);
        added++;
      }
    }

    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(2);
    logger.error(`[migrations] V2: Added ${added} pattern columns`);
  } catch (err) {
    logger.error({ err }, `[migrations] V2 error (graceful degradation):`);
  }
}

/** Get set of column names for a table via PRAGMA. */
function getExistingColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(rows.map(r => r.name));
}
