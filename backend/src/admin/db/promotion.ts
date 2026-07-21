/**
 * admin/db/promotion.ts — KB entry promotion cooldown tracking.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import { getAdminAdapter } from './core.js';

/** Ensure the promotion_cooldowns table exists (lazy-init). */
async function ensureTable(): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS promotion_cooldowns (
      entry_id TEXT NOT NULL,
      cooldown_until TEXT NOT NULL,
      rejected_at TEXT NOT NULL,
      rejected_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_promo_cooldown_entry ON promotion_cooldowns(entry_id);
  `);
}

/**
 * Place an entry on a 7-day promotion cooldown after rejection.
 * @param entryId - KB entry being put on cooldown
 * @param rejectedBy - Username of the reviewer who rejected
 */
export async function setPromotionCooldown(entryId: string, rejectedBy: string): Promise<void> {
  await ensureTable();
  const adapter = getAdminAdapter();
  const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await adapter.runAsync(
    'INSERT INTO promotion_cooldowns (entry_id, cooldown_until, rejected_at, rejected_by) VALUES (?, ?, ?, ?)',
    [entryId, cooldownUntil, new Date().toISOString(), rejectedBy],
  );
}

/**
 * Check whether an entry is currently on promotion cooldown.
 * @returns Cooldown status and optional expiry timestamp
 */
export async function checkPromotionCooldown(
  entryId: string,
): Promise<{ onCooldown: boolean; cooldownUntil?: string }> {
  await ensureTable();
  const adapter = getAdminAdapter();
  const now = new Date().toISOString();
  const row = await adapter.getAsync<{ cooldown_until: string }>(
    'SELECT cooldown_until FROM promotion_cooldowns WHERE entry_id = ? AND cooldown_until > ? ORDER BY cooldown_until DESC LIMIT 1',
    [entryId, now],
  );
  if (row) return { onCooldown: true, cooldownUntil: row.cooldown_until };
  return { onCooldown: false };
}
