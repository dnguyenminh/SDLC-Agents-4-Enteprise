/**
 * IT-05 — schema DDL creates tool_usage idempotently; data preserved on re-apply.
 * SA4E-18 BR-10. Uses a real temp SQLite DB.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SCHEMA_V1 } from '../schema.js';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';

describe('IT-05: tool_usage schema idempotency', () => {
  let ctx: TempDb;
  beforeEach(() => { ctx = makeTempDb(); });
  afterEach(() => ctx.close());

  it('creates tool_usage with expected columns and preserves data on re-apply', async () => {
    const db = ctx.dbManager.getDb();
    const cols = db.pragma('table_info(tool_usage)') as any[];
    const byName = Object.fromEntries(cols.map(c => [c.name, c]));
    expect(byName['tool_name']).toBeDefined();
    expect(byName['tool_name'].pk).toBe(1);
    expect(byName['call_count'].notnull).toBe(1);
    expect(String(byName['call_count'].dflt_value)).toBe('0');
    expect(byName['last_called_at']).toBeDefined();

    // Seed a row, then re-apply SCHEMA_V1 (simulate restart) — must not error or wipe.
    await ctx.engine.incrementToolUsage('mem_search');
    expect(() => db.exec(SCHEMA_V1)).not.toThrow();
    const rows = await ctx.engine.getToolUsage('mem_search');
    expect(rows).toHaveLength(1);
    expect(rows[0].call_count).toBe(1);
  });
});
