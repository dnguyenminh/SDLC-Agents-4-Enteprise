import { getAdminDb } from './core.js';

function initPromotionCooldownTable(): void {
  const d = getAdminDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS promotion_cooldowns (
      entry_id TEXT NOT NULL,
      cooldown_until TEXT NOT NULL,
      rejected_at TEXT NOT NULL,
      rejected_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_promo_cooldown_entry ON promotion_cooldowns(entry_id);
  `);
}

export function setPromotionCooldown(entryId: string, rejectedBy: string): void {
  const d = getAdminDb();
  initPromotionCooldownTable();
  const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  d.prepare('INSERT INTO promotion_cooldowns (entry_id, cooldown_until, rejected_at, rejected_by) VALUES (?, ?, ?, ?)').run(
    entryId, cooldownUntil, new Date().toISOString(), rejectedBy
  );
}

export function checkPromotionCooldown(entryId: string): { onCooldown: boolean; cooldownUntil?: string } {
  const d = getAdminDb();
  initPromotionCooldownTable();
  const now = new Date().toISOString();
  const row = d.prepare('SELECT cooldown_until FROM promotion_cooldowns WHERE entry_id = ? AND cooldown_until > ? ORDER BY cooldown_until DESC LIMIT 1').get(entryId, now) as any;
  if (row) return { onCooldown: true, cooldownUntil: row.cooldown_until };
  return { onCooldown: false };
}
