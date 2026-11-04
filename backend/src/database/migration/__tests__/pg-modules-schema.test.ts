/**
 * Regression tests for the PG `modules` column-parity fix.
 *
 * Bug: pg-schema-ensure.ts only created modules(id, project_id, name, path)
 * with CREATE TABLE IF NOT EXISTS — which never adds columns to an existing
 * deployment — so every full index died at updateModules with PG 42703
 * `column "root_path" of relation "modules" does not exist` and `modules`
 * stayed empty. ensureModulesSchema() brings the table to full engine-schema
 * parity (engine/db/schema.ts) idempotently on every boot.
 */

import { describe, it, expect, vi } from 'vitest';
import type { DatabaseAdapter } from '../../adapters/DatabaseAdapter.js';
import { ensureModulesSchema } from '../pg-modules-schema.js';

/** Columns required by updateModules / detectAndStorePatterns / MODULE_COLUMNS. */
const EXPECTED_COLUMNS = [
  'root_path', 'language', 'description', 'file_count', 'symbol_count',
  'di_style', 'error_handling', 'naming_convention', 'logging_framework',
  'testing_framework', 'purpose',
];

describe('ensureModulesSchema (PG modules column parity)', () => {
  it('issues an idempotent ALTER for every engine-schema column + unique index', async () => {
    const issued: string[] = [];
    const adapter = {
      runAsync: vi.fn(async (sql: string) => {
        issued.push(sql);
        return { changes: 0 };
      }),
    } as unknown as DatabaseAdapter;

    await ensureModulesSchema(adapter);

    for (const col of EXPECTED_COLUMNS) {
      expect(issued.some(s => s.includes(`ADD COLUMN IF NOT EXISTS ${col}`)), `missing ALTER for ${col}`).toBe(true);
    }
    expect(
      issued.some(s => s.includes('UNIQUE INDEX IF NOT EXISTS') && s.includes('(project_id, name)')),
      'missing UNIQUE(project_id, name) index',
    ).toBe(true);
    // Idempotency contract: every DDL statement (ALTER/CREATE) must carry IF NOT EXISTS.
    // Legacy data-repair DML (UPDATE/DELETE) is idempotent by construction (no-op when
    // no duplicates exist) and is exempt from the textual check.
    const ddl = issued.filter(s => /^\s*(ALTER|CREATE)\b/i.test(s));
    expect(ddl.length).toBeGreaterThan(0);
    expect(ddl.every(s => s.includes('IF NOT EXISTS'))).toBe(true);
  });

  it('repairs duplicate (project_id, name) rows BEFORE creating the unique index', async () => {
    const issued: string[] = [];
    const adapter = {
      runAsync: vi.fn(async (sql: string) => { issued.push(sql); return { changes: 0 }; }),
    } as unknown as DatabaseAdapter;

    await ensureModulesSchema(adapter);

    const at = (re: RegExp) => issued.findIndex(s => re.test(s));
    const update = at(/^\s*UPDATE modules\b/i);
    const del = at(/^\s*DELETE FROM modules\b/i);
    const index = at(/CREATE UNIQUE INDEX/i);
    expect(update, 'missing stats-merge UPDATE').toBeGreaterThanOrEqual(0);
    // Merge must aggregate over ALL per-language rows, so UPDATE precedes DELETE.
    expect(update).toBeLessThan(del);
    // The index can only be built once duplicates are gone.
    expect(del).toBeLessThan(index);
  });

  it('never throws — statement errors are swallowed so boot continues', async () => {
    const adapter = {
      runAsync: vi.fn(async () => {
        throw new Error('42703 column already exists');
      }),
    } as unknown as DatabaseAdapter;

    await expect(ensureModulesSchema(adapter)).resolves.toBeUndefined();
  });
});
