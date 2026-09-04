/**
 * SA4E-237 (GD5) — Idempotent schema bootstrap for Pega semantic reference resolution.
 *
 * Creates `pega_reference_resolution` (plus indexes) if it does not exist. The table records,
 * per project, how each rule-to-rule reference resolved against the indexed dataset:
 *   - resolved   : target found as a concrete symbol in the dataset
 *   - external   : target absent (lives in a non-exported ruleset) — NOT an error
 *   - unresolved : target could not be located and is expected to exist (suspicious)
 *   - ambiguous  : multiple candidates, cannot pick without runtime ruleset/circumstance context
 *
 * DDL is engine-aware (SQLite vs PostgreSQL) and safe to call on every boot.
 */

import pino from 'pino';
import { getDbAdapter, getActiveEngine } from '../../admin/db/core.js';

const logger = pino({ name: 'sa4e-237-schema' });

/** Ensure the pega_reference_resolution table exists. Idempotent; safe on every boot. */
export async function ensureSa4e237Tables(): Promise<void> {
  const engine = getActiveEngine();
  const tsType = engine === 'postgresql' ? 'TIMESTAMP WITH TIME ZONE' : 'TIMESTAMP';
  const pk = engine === 'postgresql' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const adapter = getDbAdapter();

  const ddl = `
CREATE TABLE IF NOT EXISTS pega_reference_resolution (
  id                ${pk},
  project_id        TEXT NOT NULL,
  source_symbol_id  INTEGER NOT NULL,
  source_fqn        TEXT NOT NULL,
  ref_kind          TEXT NOT NULL,
  ref_path          TEXT NOT NULL,
  target_symbol_id  INTEGER,
  target_fqn        TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'unresolved'
                    CHECK (resolution_status IN ('resolved','external','unresolved','ambiguous')),
  detail            TEXT,
  created_at        ${tsType} NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pega_ref_source
  ON pega_reference_resolution (source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_pega_ref_project_status
  ON pega_reference_resolution (project_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_pega_ref_target
  ON pega_reference_resolution (target_symbol_id);
`;

  try {
    await adapter.execAsync(ddl);
    logger.info('[sa4e-237] pega_reference_resolution table ensured');
  } catch (err) {
    logger.error({ err }, '[sa4e-237] failed to ensure table');
    throw err;
  }
}
