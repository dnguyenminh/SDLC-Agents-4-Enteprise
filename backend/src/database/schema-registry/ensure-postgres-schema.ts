/**
 * PostgreSQL bootstrapping — one-shot, idempotent schema ensure — SA4E-335 DEF-002.
 *
 * initSchema() (admin/db/schema.ts) creates the admin/graph tables only, so a
 * fresh postgres database was missing the index tables (files/symbols/…), the
 * memory/KB base tables (knowledge_entries/…) and `mcp_tools`. Module init
 * then died with `relation "…" does not exist`, the memory module reported
 * `error` and /health stayed 503 even though the container was "healthy";
 * the tool-ingestion subscriber failed on mcp_tools the same way.
 *
 * Every ensure here is idempotent (IF NOT EXISTS) and a no-op on non-postgres
 * engines, so initAdapters() can call this unconditionally.
 */

import pino from 'pino';
import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { ensurePostgresIndexSchema } from '../migration/pg-schema-ensure.js';
import { ensurePostgresMemorySchema } from './ensure-postgres-memory.js';

const logger = pino({ name: 'pg-schema' });

/**
 * mcp_tools is created by index.ts with sqlite types (`vector BLOB`) — PG has
 * no BLOB, so provide the PG shape (BYTEA) first; index.ts's IF NOT EXISTS
 * then skips it (PG checks existence before resolving column types).
 */
async function ensureMcpToolsTable(adapter: DatabaseAdapter): Promise<void> {
  try {
    await adapter.execAsync(`CREATE TABLE IF NOT EXISTS mcp_tools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      category TEXT,
      server TEXT,
      vector BYTEA
    )`);
    await adapter.execAsync(`CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)`);
  } catch (err) {
    logger.debug({ err }, 'mcp_tools ensure skipped');
  }
}

export async function ensurePostgresSchema(adapter: DatabaseAdapter): Promise<void> {
  if (adapter.getEngine() !== 'postgresql' || !adapter.isConnected()) return;
  // Memory first: index.ts gates its PG backfill on knowledge_entries existing.
  await ensurePostgresMemorySchema(adapter);
  await ensureMcpToolsTable(adapter);
  await ensurePostgresIndexSchema(adapter);
}
