/**
 * UT-06..09 — MemoryEngine.incrementToolUsage / getToolUsage (SA4E-18).
 * Uses a real temp SQLite DB (better-sqlite3) with full schema applied.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';

describe('MemoryEngine tool usage', () => {
  let ctx: TempDb;
  beforeEach(() => { ctx = makeTempDb(); });
  afterEach(() => ctx.close());

  it('UT-06: first call inserts row with call_count = 1', async () => {
    await ctx.engine.incrementToolUsage('mem_search');
    const rows = await ctx.engine.getToolUsage('mem_search');
    expect(rows).toHaveLength(1);
    expect(rows[0].call_count).toBe(1);
    expect(rows[0].last_called_at).toBeTruthy();
  });

  it('UT-07: subsequent calls increment existing row (UPSERT, single row)', async () => {
    for (let i = 0; i < 3; i++) await ctx.engine.incrementToolUsage('code_search');
    const rows = await ctx.engine.getToolUsage('code_search');
    expect(rows).toHaveLength(1);
    expect(rows[0].call_count).toBe(3);
  });

  it('UT-08: no filter returns rows ordered by call_count DESC', async () => {
    const seed: Record<string, number> = { find_tools: 9, mem_search: 5, code_search: 2 };
    for (const [name, n] of Object.entries(seed)) {
      for (let i = 0; i < n; i++) await ctx.engine.incrementToolUsage(name);
    }
    const rows = await ctx.engine.getToolUsage();
    expect(rows.map(r => r.tool_name)).toEqual(['find_tools', 'mem_search', 'code_search']);
    expect(rows.map(r => r.call_count)).toEqual([9, 5, 2]);
  });

  it('UT-09: filter by tool_name returns single row; unknown returns empty', async () => {
    await ctx.engine.incrementToolUsage('mem_search');
    await ctx.engine.incrementToolUsage('code_search');
    const one = await ctx.engine.getToolUsage('mem_search');
    expect(one).toHaveLength(1);
    expect(one[0].tool_name).toBe('mem_search');
    expect(await ctx.engine.getToolUsage('never_called')).toEqual([]);
  });
});
