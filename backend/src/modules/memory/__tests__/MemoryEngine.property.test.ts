/**
 * PBT-04 — incrementToolUsage monotonicity (SA4E-18).
 * Property: for any tool name and any N in [1..200], calling incrementToolUsage
 * N times yields call_count === N. fast-check not available -> random loop.
 */

import { describe, it, expect } from 'vitest';
import { makeTempDb } from '../../../__tests__/sa4e-testkit.js';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('MemoryEngine.incrementToolUsage property', () => {
  it('PBT-04: N increments yield call_count === N (60 random cases)', async () => {
    const rand = rng(999);
    for (let c = 0; c < 60; c++) {
      const ctx = makeTempDb();
      try {
        const name = `tool_${Math.floor(rand() * 1e6).toString(36)}`;
        const n = 1 + Math.floor(rand() * 200);
        for (let i = 0; i < n; i++) await ctx.engine.incrementToolUsage(name);
        const rows = await ctx.engine.getToolUsage(name);
        expect(rows).toHaveLength(1);
        expect(rows[0].call_count).toBe(n);
        expect(rows[0].last_called_at).toBeTruthy();
      } finally {
        ctx.close();
      }
    }
  });
});
