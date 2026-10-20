/**
 * Promotion queue DDL + candidate scanning/queuing for ScopePromotionService.
 * Extracted from promotion/service.ts (BR-18) — no behavior change.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';
import type { PromotionCandidate, PromotionConfig } from './rules.js';
import { evaluateCriteria } from './rules.js';

/** Ensure promotion queue table exists — must be awaited before use. SA4E-53: async. */
export async function ensurePromotionQueueTable(adapter: DatabaseAdapter): Promise<void> {
  // DDL default uses engine-specific now expression
  const nowDefault = adapter.getEngine() === 'sqlite'
    ? "(datetime('now'))" : 'NOW()';
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS kb_promotion_queue (
      promotion_id TEXT PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      source_tier TEXT NOT NULL,
      target_tier TEXT NOT NULL,
      reason TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      review_comment TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      cooldown_until TEXT,
      created_at TEXT NOT NULL DEFAULT ${nowDefault},
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    )
  `);
  await adapter.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_kpq_status ON kb_promotion_queue(status)
  `);
  await adapter.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_kpq_entry ON kb_promotion_queue(entry_id)
  `);
}

export async function scanForPromotionCandidates(
  adapter: DatabaseAdapter,
  logger: Logger,
  config: PromotionConfig,
  limit = 50,
): Promise<PromotionCandidate[]> {
  const candidates: PromotionCandidate[] = [];
  const minAge = new Date(Date.now() - config.minAgeHours * 3600_000).toISOString();

  const entries = await adapter.allAsync<any>(`
    SELECT ke.id, ke.summary, ke.type, ke.access_count, ke.quality_score, ke.created_at
    FROM knowledge_entries ke
    WHERE ke.scope = 'USER'
      AND ke.archived = 0
      AND ke.created_at <= ?
      AND ke.id NOT IN (
        SELECT entry_id FROM kb_promotion_queue
        WHERE status IN ('PENDING', 'APPROVED')
      )
    ORDER BY ke.access_count DESC
    LIMIT ?
  `, [minAge, limit]);

  for (const entry of entries) {
    const criteria = await evaluateCriteria(adapter, entry, config);
    if (criteria.metCount >= config.minCriteriaMet) {
      candidates.push({
        entryId: entry.id,
        currentScope: 'USER',
        targetScope: 'PROJECT',
        reason: criteria.reasons.join('; '),
        score: criteria.score,
      });
    }
  }

  logger.info({ scanned: entries.length, candidates: candidates.length }, 'Promotion scan complete');
  return candidates;
}

export async function queueCandidates(
  adapter: DatabaseAdapter,
  dialect: DialectHelper,
  logger: Logger,
  config: PromotionConfig,
  candidates: PromotionCandidate[],
): Promise<{ queued: number; autoApproved: number }> {
  let queued = 0;
  let autoApproved = 0;

  // SA4E-53: use transactionAsync for atomic batch operations
  await adapter.transactionAsync(async () => {
    for (const c of candidates) {
      const promotionId = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (config.autoApproveToProject && c.targetScope === 'PROJECT') {
        await adapter.runAsync(
          `UPDATE knowledge_entries SET scope = ?, updated_at = ${dialect.now()} WHERE id = ?`,
          [c.targetScope, c.entryId],
        );
        await adapter.runAsync(
          `INSERT INTO kb_promotion_queue
           (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (promotion_id) DO NOTHING`,
          [promotionId, c.entryId, c.currentScope, c.targetScope, c.reason, c.score, 'APPROVED'],
        );
        autoApproved++;
      } else {
        await adapter.runAsync(
          `INSERT INTO kb_promotion_queue
           (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (promotion_id) DO NOTHING`,
          [promotionId, c.entryId, c.currentScope, c.targetScope, c.reason, c.score, 'PENDING'],
        );
        queued++;
      }
    }
  });

  logger.info({ queued, autoApproved }, 'Promotion candidates processed');
  return { queued, autoApproved };
}
