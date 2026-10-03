/**
 * Regression — two schema bootstraps were shipped but never invoked:
 *   SA4E-237 `ensureSa4e237Tables` → pega_reference_resolution
 *   SA4E-276 `ensureSa4e276`       → entra_sso_config
 * Without the wiring, every Pega rule ingest logged
 * `no such table: pega_reference_resolution` and Entra SSO config writes failed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initAdapters, getAdminDb } from '../../../admin/admin-db.js';
import { ensureSa4e237Tables } from '../ensure-sa4e-237.js';
import { ensureSa4e276 } from '../ensure-sa4e-276.js';

beforeAll(async () => {
  await initAdapters();
});

async function tableExists(name: string): Promise<boolean> {
  const db = getAdminDb();
  const row = await db.getAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return row?.name === name;
}

describe('schema-registry bootstraps', () => {
  it('creates pega_reference_resolution (SA4E-237)', async () => {
    await ensureSa4e237Tables();
    expect(await tableExists('pega_reference_resolution')).toBe(true);
  });

  it('creates entra_sso_config (SA4E-276)', async () => {
    await ensureSa4e276();
    expect(await tableExists('entra_sso_config')).toBe(true);
  });

  it('is safe to run twice (idempotent)', async () => {
    await ensureSa4e237Tables();
    await ensureSa4e276();
    expect(await tableExists('pega_reference_resolution')).toBe(true);
    expect(await tableExists('entra_sso_config')).toBe(true);
  });

  it('is wired into server startup — an orphan ensure creates nothing', () => {
    const entry = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf-8');
    expect(entry).toContain('ensureSa4e237Tables()');
    expect(entry).toContain('ensureSa4e276()');
    expect(entry).toContain('ensureSa4e215Tables()');
  });
});
