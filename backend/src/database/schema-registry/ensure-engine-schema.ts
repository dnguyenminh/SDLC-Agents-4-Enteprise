/**
 * Ensure engine index schema on the serving adapter (unified DB).
 *
 * Root cause: SqliteAdapter (sqlite-wasm) keeps a private in-memory DB per
 * instance and only exports to the host file on disconnect(). The versioned
 * migrations in engine/db run on database-manager's adapter, so sibling
 * adapters (the one serving tools/queries) can miss the index tables
 * (files/symbols/modules/symbols_fts) and every code-intel tool fails with
 * `no such table`. Re-applying the canonical SCHEMA_V1 here is idempotent
 * (all statements are CREATE TABLE/INDEX IF NOT EXISTS) and makes the
 * serving adapter self-sufficient on every boot, on any engine path that
 * lands on SQLite.
 */

import pino from 'pino';
import { getDbAdapter } from '../../admin/db/core.js';
import { SCHEMA_V1 } from '../../engine/db/schema.js';

const logger = pino({ name: 'engine-schema' });

export async function ensureEngineIndexSchema(): Promise<void> {
  const adapter = getDbAdapter();
  try {
    await adapter.execAsync(SCHEMA_V1);
    logger.info('[engine-schema] index tables ensured (files/symbols/modules/fts)');
  } catch (err) {
    logger.warn({ err }, '[engine-schema] ensure failed (non-fatal)');
  }
}
