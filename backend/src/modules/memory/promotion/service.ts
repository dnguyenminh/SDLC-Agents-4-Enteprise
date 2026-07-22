/**
 * ScopePromotionService — manages KB entry promotion pipeline.
 * SA4E-53: migrated from raw better-sqlite3 to DatabaseAdapter async API for PostgreSQL compatibility.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';
import {
  type PromotionCandidate, type PromotionConfig, DEFAULT_CONFIG, evaluateCriteria,
} from './rules.js';

export class ScopePromotionService {
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;
  private readonly logger: Logger;
  private readonly config: PromotionConfig;

  constructor(adapter: DatabaseAdapter, logger: Logger, config?: Partial<PromotionConfig>) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.logger = logger.child({ service: 'scope-promotion' });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Ensure promotion queue table exists — must be awaited before use. SA4E-53: async. */
  async ensurePromotionQueueTable(): Promise<void> {
    // DDL default uses engine-specific now expression
    const nowDefault = this.adapter.getEngine() === 'sqlite'
      ? "(datetime('now'))" : 'NOW()';
    await this.adapter.execAsync(`
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
    await this.adapter.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_kpq_status ON kb_promotion_queue(status)
    `);
    await this.adapter.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_kpq_entry ON kb_promotion_queue(entry_id)
    `);
  }

  async scanForPromotionCandidates(limit = 50): Promise<PromotionCandidate[]> {
    const candidates: PromotionCandidate[] = [];
    const minAge = new Date(Date.now() - this.config.minAgeHours * 3600_000).toISOString();

    const entries = await this.adapter.allAsync<any>(`
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
      const criteria = await evaluateCriteria(this.adapter, entry, this.config);
      if (criteria.metCount >= this.config.minCriteriaMet) {
        candidates.push({
          entryId: entry.id,
          currentScope: 'USER',
          targetScope: 'PROJECT',
          reason: criteria.reasons.join('; '),
          score: criteria.score,
        });
      }
    }

    this.logger.info({ scanned: entries.length, candidates: candidates.length }, 'Promotion scan complete');
    return candidates;
  }

  async queueCandidates(candidates: PromotionCandidate[]): Promise<{ queued: number; autoApproved: number }> {
    let queued = 0;
    let autoApproved = 0;

    // SA4E-53: use transactionAsync for atomic batch operations
    await this.adapter.transactionAsync(async () => {
      for (const c of candidates) {
        const promotionId = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (this.config.autoApproveToProject && c.targetScope === 'PROJECT') {
          await this.adapter.runAsync(
            `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
            [c.targetScope, c.entryId],
          );
          await this.adapter.runAsync(
            `INSERT INTO kb_promotion_queue
             (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (promotion_id) DO NOTHING`,
            [promotionId, c.entryId, c.currentScope, c.targetScope, c.reason, c.score, 'APPROVED'],
          );
          autoApproved++;
        } else {
          await this.adapter.runAsync(
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

    this.logger.info({ queued, autoApproved }, 'Promotion candidates processed');
    return { queued, autoApproved };
  }

  async runPromotionCycle(): Promise<string> {
    const candidates = await this.scanForPromotionCandidates();
    if (candidates.length === 0) {
      return 'No promotion candidates found.';
    }
    const { queued, autoApproved } = await this.queueCandidates(candidates);
    return `Promotion cycle: ${candidates.length} candidates found. Queued: ${queued}, Auto-approved: ${autoApproved}.`;
  }

  async listPending(limit = 20): Promise<any[]> {
    return this.adapter.allAsync<any>(`
      SELECT pq.*, ke.summary, ke.type, ke.tier, ke.scope
      FROM kb_promotion_queue pq
      JOIN knowledge_entries ke ON ke.id = pq.entry_id
      WHERE pq.status = 'PENDING'
      ORDER BY pq.score DESC, pq.created_at ASC
      LIMIT ?
    `, [limit]);
  }

  async approve(entryId: number, reviewerId: string, comment: string): Promise<boolean> {
    const promo = await this.adapter.getAsync<any>(
      'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?',
      [entryId, 'PENDING'],
    );
    if (!promo) return false;

    await this.adapter.runAsync(`
      UPDATE kb_promotion_queue
      SET status = 'APPROVED', reviewed_by = ?, review_comment = ?, reviewed_at = ${this.dialect.now()}
      WHERE promotion_id = ?
    `, [reviewerId, comment, promo.promotion_id]);

    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [promo.target_tier, entryId],
    );

    this.logger.info({ entryId, target: promo.target_tier, reviewer: reviewerId }, 'Promotion approved');
    return true;
  }

  async reject(entryId: number, reviewerId: string, comment: string): Promise<boolean> {
    const promo = await this.adapter.getAsync<any>(
      'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?',
      [entryId, 'PENDING'],
    );
    if (!promo) return false;

    await this.adapter.runAsync(`
      UPDATE kb_promotion_queue
      SET status = 'REJECTED', reviewed_by = ?, review_comment = ?, reviewed_at = ${this.dialect.now()}
      WHERE promotion_id = ?
    `, [reviewerId, comment, promo.promotion_id]);

    this.logger.info({ entryId, reviewer: reviewerId }, 'Promotion rejected (no cooldown)');
    return true;
  }

  async requestSharedPromotion(entryId: number, reason: string): Promise<boolean> {
    const entry = await this.adapter.getAsync<any>(
      'SELECT * FROM knowledge_entries WHERE id = ? AND scope = ?',
      [entryId, 'PROJECT'],
    );
    if (!entry) return false;

    const existing = await this.adapter.getAsync<any>(
      "SELECT 1 FROM kb_promotion_queue WHERE entry_id = ? AND target_tier = 'SHARED' AND status = 'PENDING'",
      [entryId],
    );
    if (existing) return false;

    const promotionId = `promo-shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.adapter.runAsync(`
      INSERT INTO kb_promotion_queue (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
      VALUES (?, ?, 'PROJECT', 'SHARED', ?, 0, 'PENDING')
    `, [promotionId, entryId, reason]);

    this.logger.info({ entryId, reason }, 'SHARED promotion requested');
    return true;
  }

  async promoteOnMerge(ticketKey: string): Promise<{ promoted: number; skipped: number }> {
    const entries = await this.adapter.allAsync<any>(`
      SELECT id, scope FROM knowledge_entries
      WHERE scope = 'USER'
        AND archived = 0
        AND (
          tags LIKE ? OR source LIKE ? OR summary LIKE ?
        )
    `, [`%${ticketKey}%`, `%${ticketKey}%`, `%${ticketKey}%`]);

    let promoted = 0;
    let skipped = 0;

    await this.adapter.transactionAsync(async () => {
      for (const entry of entries) {
        if (entry.scope !== 'USER') { skipped++; continue; }
        await this.adapter.runAsync(
          `UPDATE knowledge_entries SET scope = 'PROJECT', updated_at = ${this.dialect.now()} WHERE id = ?`,
          [entry.id],
        );
        await this.adapter.runAsync(
          `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, 'USER', 'PROJECT', ?)`,
          [entry.id, `Auto-promoted on merge/release: ${ticketKey}`],
        );
        promoted++;
      }
    });

    this.logger.info({ ticketKey, promoted, skipped, total: entries.length }, 'promoteOnMerge completed');
    return { promoted, skipped };
  }
}
