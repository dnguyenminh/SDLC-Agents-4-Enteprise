/**
 * IT-04 — mem_admin action=tool_usage read path returns usage rows (OI-1).
 * Real MemoryToolDispatcher wired to a real engine + temp SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryToolDispatcher } from '../dispatchers/index.js';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';

describe('IT-04: mem_admin tool_usage read path', () => {
  let ctx: TempDb;
  let dispatcher: MemoryToolDispatcher;

  beforeEach(() => {
    ctx = makeTempDb();
    dispatcher = new MemoryToolDispatcher(ctx.engine, ctx.tmpDir);
    for (let i = 0; i < 5; i++) ctx.engine.incrementToolUsage('mem_search');
    for (let i = 0; i < 2; i++) ctx.engine.incrementToolUsage('code_search');
  });
  afterEach(() => ctx.close());

  it('returns JSON array of usage rows and supports name filter', async () => {
    const all = await dispatcher.dispatch('mem_admin', { action: 'tool_usage', limit: 20 });
    expect(all).not.toBeNull();
    const rows = JSON.parse(all as string);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveProperty('tool_name');
    expect(rows[0]).toHaveProperty('call_count');
    expect(rows[0]).toHaveProperty('last_called_at');

    const filtered = JSON.parse(await dispatcher.dispatch('mem_admin', { action: 'tool_usage', tool_name: 'mem_search' }) as string);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].tool_name).toBe('mem_search');
    expect(filtered[0].call_count).toBe(5);
  });
});
