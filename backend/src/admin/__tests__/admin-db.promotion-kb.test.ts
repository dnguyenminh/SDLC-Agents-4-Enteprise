/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  setPromotionCooldown,
  checkPromotionCooldown,
  searchKbEntries,
  initAdapters,
} from '../admin-db.js';

// Await shared DB init (schema + admin seed) before any test touches the DB —
// getDbAdapter() inits fire-and-forget, so getUserByUsername('admin') would
// otherwise race seeding and return null.
beforeAll(async () => {
  await initAdapters();
});

// ============================================================
// 8. Promotion Cooldown
// ============================================================

describe('Promotion Cooldown', () => {
  const entryId = `cooldown-test-${Date.now()}`;

  it('checkPromotionCooldown returns false when no cooldown set', async () => {
    const result = await checkPromotionCooldown(entryId);
    expect(result.onCooldown).toBe(false);
    expect(result.cooldownUntil).toBeUndefined();
  });

  it('setPromotionCooldown sets 7-day cooldown', async () => {
    await setPromotionCooldown(entryId, 'reviewer1');
    const result = await checkPromotionCooldown(entryId);
    expect(result.onCooldown).toBe(true);
    expect(result.cooldownUntil).toBeDefined();
    const diffDays = (new Date(result.cooldownUntil!).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('different entry has no cooldown', async () => {
    const result = await checkPromotionCooldown('other-entry-no-cooldown');
    expect(result.onCooldown).toBe(false);
  });
});

// ============================================================
// 9. KB Search
// ============================================================

describe('KB Search', () => {
  it('searchKbEntries returns results or empty array', async () => {
    const result = await searchKbEntries('test');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('searchKbEntries handles empty query gracefully', async () => {
    const result = await searchKbEntries('');
    expect(result).toHaveProperty('items');
    expect(typeof result.total).toBe('number');
  });
});
