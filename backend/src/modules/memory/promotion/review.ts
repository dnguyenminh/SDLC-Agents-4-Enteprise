/**
 * Promotion review actions (pending list, approve/reject, SHARED promotion, merge promotion).
 * Extracted from promotion/service.ts (BR-18) — no behavior change.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';

export async function listPending(adapter: DatabaseAdapter, limit = 20): Promise<any[]> {
  return adapter.allAsync<any>(`
    SELECT pq.*, ke.summary, ke.type, ke.tier, ke.scope
    FROM kb_promotion_queue pq
    JOIN knowledge_entries ke ON ke.id = pq.entry_id
    WHERE pq.status = 'PENDING'
    ORDER BY pq.score DESC, pq.created_at ASC
    LIMIT ?
  `, [limit]);
}

export async function approve(
  adapter: DatabaseAdapter, dialect: DialectHelper, logger: Logger,
  entryId: number, reviewerId: string, comment: string,
): Promise<boolean> {
  const promo = await adapter.getAsync<any>(
    'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?',
    [entryId, 'PENDING'],
  );
  if (!promo) return false;

  await adapter.runAsync(`
    UPDATE kb_promotion_queue
    SET status = 'APPROVED', reviewed_by = ?, review_comment = ?, reviewed_at = ${dialect.now()}
    WHERE promotion_id = ?
  `, [reviewerId, comment, promo.promotion_id]);

  await adapter.runAsync(
    `UPDATE knowledge_entries SET scope = ?, updated_at = ${dialect.now()} WHERE id = ?`,
    [promo.target_tier, entryId],
  );

  logger.info({ entryId, target: promo.target_tier, reviewer: reviewerId }, 'Promotion approved');
  return true;
}

export async function reject(
  adapter: DatabaseAdapter, dialect: DialectHelper, logger: Logger,
  entryId: number, reviewerId: string, comment: string,
): Promise<boolean> {
  const promo = await adapter.getAsync<any>(
    'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?',
    [entryId, 'PENDING'],
  );
  if (!promo) return false;

  await adapter.runAsync(`
    UPDATE kb_promotion_queue
    SET status = 'REJECTED', reviewed_by = ?, review_comment = ?, reviewed_at = ${dialect.now()}
    WHERE promotion_id = ?
  `, [reviewerId, comment, promo.promotion_id]);

  logger.info({ entryId, reviewer: reviewerId }, 'Promotion rejected (no cooldown)');
  return true;
}

export async function requestSharedPromotion(
  adapter: DatabaseAdapter, logger: Logger, entryId: number, reason: string,
): Promise<boolean> {
  const entry = await adapter.getAsync<any>(
    'SELECT * FROM knowledge_entries WHERE id = ? AND scope = ?',
    [entryId, 'PROJECT'],
  );
  if (!entry) return false;

  const existing = await adapter.getAsync<any>(
    "SELECT 1 FROM kb_promotion_queue WHERE entry_id = ? AND target_tier = 'SHARED' AND status = 'PENDING'",
    [entryId],
  );
  if (existing) return false;

  const promotionId = `promo-shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await adapter.runAsync(`
    INSERT INTO kb_promotion_queue (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
    VALUES (?, ?, 'PROJECT', 'SHARED', ?, 0, 'PENDING')
  `, [promotionId, entryId, reason]);

  logger.info({ entryId, reason }, 'SHARED promotion requested');
  return true;
}

export async function promoteOnMerge(
  adapter: DatabaseAdapter, dialect: DialectHelper, logger: Logger, ticketKey: string,
): Promise<{ promoted: number; skipped: number }> {
  const entries = await adapter.allAsync<any>(`
    SELECT id, scope FROM knowledge_entries
    WHERE scope = 'USER'
      AND archived = 0
      AND (
        tags LIKE ? OR source LIKE ? OR summary LIKE ?
      )
  `, [`%${ticketKey}%`, `%${ticketKey}%`, `%${ticketKey}%`]);

  let promoted = 0;
  let skipped = 0;

  await adapter.transactionAsync(async () => {
    for (const entry of entries) {
      if (entry.scope !== 'USER') { skipped++; continue; }
      await adapter.runAsync(
        `UPDATE knowledge_entries SET scope = 'PROJECT', updated_at = ${dialect.now()} WHERE id = ?`,
        [entry.id],
      );
      await adapter.runAsync(
        `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, 'USER', 'PROJECT', ?)`,
        [entry.id, `Auto-promoted on merge/release: ${ticketKey}`],
      );
      promoted++;
    }
  });

  logger.info({ ticketKey, promoted, skipped, total: entries.length }, 'promoteOnMerge completed');
  return { promoted, skipped };
}
