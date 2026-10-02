/**
 * Ensure the canonical memory (KB) base tables exist on PostgreSQL — SA4E-335 DEF-002.
 *
 * Root cause: MemoryModuleBuilder executed MEMORY_SCHEMA only for sqlite
 * (`getEngine() === 'sqlite'`), and initSchema() (admin/db/schema.ts) creates
 * admin/graph tables only. A fresh postgres database therefore had no
 * `knowledge_entries`…; migration-001 failed with
 * `relation "knowledge_entries" does not exist`, the memory module reported
 * `error` and /health stayed 503 while the container ran "healthy".
 *
 * Fix: translate the canonical sqlite DDL (modules/memory/schema) statement by
 * statement to postgres through the existing ddl-translator (SA4E-45) and
 * apply it idempotently (`IF NOT EXISTS`). sqlite-only statements (FTS5
 * virtual table, triggers and their bodies) are skipped — PG gets tsvector
 * infrastructure from database/migration/fts-recreation.ts instead.
 */

import pino from 'pino';
import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { MEMORY_SCHEMA } from '../../modules/memory/schema/index.js';
import { translateCreateTable } from '../migration/ddl-translator.js';

const logger = pino({ name: 'pg-memory-schema' });

/** Plain CREATE TABLE/INDEX only — filters out FTS5/trigger statements and
 *  the trigger body fragments left behind when splitting on `;`. */
const APPLICABLE = /^CREATE\s+(TABLE|INDEX)\s/i;

/** Drop `--` comment lines so a leading comment doesn't hide a statement. */
function stripComments(sql: string): string {
  return sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim();
}

/** Split a canonical DDL batch into single statements (bodies never embed `;`). */
export function splitStatements(batch: string): string[] {
  return batch.split(';').map(stripComments).filter((s) => s.length > 0);
}

/**
 * Canonical sqlite DDL → postgres DDL.
 * datetime('now') columns are TEXT in the canonical schema, so NOW() must be
 * cast back to text — a bare `DEFAULT NOW()` is rejected by PG
 * (default timestamptz ≠ column text). The shared translator keeps its
 * `DEFAULT NOW()` behaviour for TIMESTAMPTZ-style DDL (see its unit test).
 */
export function toPostgresDdl(ddl: string): string {
  const textDefaults = ddl
    .replace(/DEFAULT\s*\(datetime\('now'\)\)/gi, 'DEFAULT (NOW()::TEXT)')
    .replace(/DEFAULT\s*datetime\('now'\)/gi, 'DEFAULT (NOW()::TEXT)');
  return translateCreateTable(textDefaults, 'postgresql');
}

/** Ensure the canonical memory schema on the adapter. No-op on other engines. */
export async function ensurePostgresMemorySchema(adapter: DatabaseAdapter): Promise<void> {
  if (adapter.getEngine() !== 'postgresql' || !adapter.isConnected()) return;
  const statements = splitStatements(MEMORY_SCHEMA)
    .filter((s) => APPLICABLE.test(s))
    .map(toPostgresDdl);
  let failed = 0;
  for (const sql of statements) {
    try {
      await adapter.execAsync(sql);
    } catch (err) {
      failed++;
      logger.debug({ err, statement: sql.slice(0, 80) }, 'statement not applied (likely already present)');
    }
  }
  logger.info({ statements: statements.length, failed }, '[pg-memory-schema] memory base tables ensured');
}
