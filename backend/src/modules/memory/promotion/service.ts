import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import {
  type PromotionCandidate, type PromotionConfig, DEFAULT_CONFIG, evaluateCriteria,
} from './rules.js';

export class ScopePromotionService {
  private readonly db: Database.Database;
  private readonly logger: Logger;
  private readonly config: PromotionConfig;

  constructor(db: Database.Database, logger: Logger, config?: Partial<PromotionConfig>) {
    this.db = db;
    this.logger = logger.child({ service: 'scope-promotion' });
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensurePromotionQueueTable();
  }

  private ensurePromotionQueueTable(): void {
    this.db.exec(`
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_kpq_status ON kb_promotion_queue(status);
      CREATE INDEX IF NOT EXISTS idx_kpq_entry ON kb_promotion_queue(entry_id);
    `);
  }

  scanForPromotionCandidates(limit = 50): PromotionCandidate[] {
    const candidates: PromotionCandidate[] = [];
    const minAge = new Date(Date.now() - this.config.minAgeHours * 3600_000).toISOString();

    const entries = this.db.prepare(`
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
    `).all(minAge, limit) as any[];

    for (const entry of entries) {
      const criteria = evaluateCriteria(this.db, entry, this.config);
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

  queueCandidates(candidates: PromotionCandidate[]): { queued: number; autoApproved: number } {
    let queued = 0;
    let autoApproved = 0;

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO kb_promotion_queue
      (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const promoteStmt = this.db.prepare(`
      UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?
    `);

    const transaction = this.db.transaction((items: PromotionCandidate[]) => {
      for (const c of items) {
        const promotionId = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (this.config.autoApproveToProject && c.targetScope === 'PROJECT') {
          promoteStmt.run(c.targetScope, c.entryId);
          insertStmt.run(promotionId, c.entryId, c.currentScope, c.targetScope, c.reason, c.score, 'APPROVED');
          autoApproved++;
        } else {
          insertStmt.run(promotionId, c.entryId, c.currentScope, c.targetScope, c.reason, c.score, 'PENDING');
          queued++;
        }
      }
    });

    transaction(candidates);
    this.logger.info({ queued, autoApproved }, 'Promotion candidates processed');
    return { queued, autoApproved };
  }

  runPromotionCycle(): string {
    const candidates = this.scanForPromotionCandidates();
    if (candidates.length === 0) {
      return 'No promotion candidates found.';
    }
    const { queued, autoApproved } = this.queueCandidates(candidates);
    return `Promotion cycle: ${candidates.length} candidates found. Queued: ${queued}, Auto-approved: ${autoApproved}.`;
  }

  listPending(limit = 20): any[] {
    return this.db.prepare(`
      SELECT pq.*, ke.summary, ke.type, ke.tier, ke.scope
      FROM kb_promotion_queue pq
      JOIN knowledge_entries ke ON ke.id = pq.entry_id
      WHERE pq.status = 'PENDING'
      ORDER BY pq.score DESC, pq.created_at ASC
      LIMIT ?
    `).all(limit) as any[];
  }

  approve(entryId: number, reviewerId: string, comment: string): boolean {
    const promo = this.db.prepare(
      'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?'
    ).get(entryId, 'PENDING') as any;
    if (!promo) return false;

    this.db.prepare(`
      UPDATE kb_promotion_queue
      SET status = 'APPROVED', reviewed_by = ?, review_comment = ?, reviewed_at = datetime('now')
      WHERE promotion_id = ?
    `).run(reviewerId, comment, promo.promotion_id);

    this.db.prepare(
      `UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(promo.target_tier, entryId);

    this.logger.info({ entryId, target: promo.target_tier, reviewer: reviewerId }, 'Promotion approved');
    return true;
  }

  reject(entryId: number, reviewerId: string, comment: string): boolean {
    const promo = this.db.prepare(
      'SELECT * FROM kb_promotion_queue WHERE entry_id = ? AND status = ?'
    ).get(entryId, 'PENDING') as any;
    if (!promo) return false;

    this.db.prepare(`
      UPDATE kb_promotion_queue
      SET status = 'REJECTED', reviewed_by = ?, review_comment = ?, reviewed_at = datetime('now')
      WHERE promotion_id = ?
    `).run(reviewerId, comment, promo.promotion_id);

    this.logger.info({ entryId, reviewer: reviewerId }, 'Promotion rejected (no cooldown)');
    return true;
  }

  requestSharedPromotion(entryId: number, reason: string): boolean {
    const entry = this.db.prepare(
      'SELECT * FROM knowledge_entries WHERE id = ? AND scope = ?'
    ).get(entryId, 'PROJECT') as any;
    if (!entry) return false;

    const existing = this.db.prepare(
      "SELECT 1 FROM kb_promotion_queue WHERE entry_id = ? AND target_tier = 'SHARED' AND status = 'PENDING'"
    ).get(entryId);
    if (existing) return false;

    const promotionId = `promo-shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(`
      INSERT INTO kb_promotion_queue (promotion_id, entry_id, source_tier, target_tier, reason, score, status)
      VALUES (?, ?, 'PROJECT', 'SHARED', ?, 0, 'PENDING')
    `).run(promotionId, entryId, reason);

    this.logger.info({ entryId, reason }, 'SHARED promotion requested');
    return true;
  }

  promoteOnMerge(ticketKey: string): { promoted: number; skipped: number } {
    const entries = this.db.prepare(`
      SELECT id, scope FROM knowledge_entries
      WHERE scope = 'USER'
        AND archived = 0
        AND (
          tags LIKE ? OR source LIKE ? OR summary LIKE ?
        )
    `).all(`%${ticketKey}%`, `%${ticketKey}%`, `%${ticketKey}%`) as any[];

    let promoted = 0;
    let skipped = 0;

    const promoteStmt = this.db.prepare(
      `UPDATE knowledge_entries SET scope = 'PROJECT', updated_at = datetime('now') WHERE id = ?`
    );
    const logStmt = this.db.prepare(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, 'USER', 'PROJECT', ?)`
    );

    const transaction = this.db.transaction((items: any[]) => {
      for (const entry of items) {
        if (entry.scope !== 'USER') { skipped++; continue; }
        promoteStmt.run(entry.id);
        logStmt.run(entry.id, `Auto-promoted on merge/release: ${ticketKey}`);
        promoted++;
      }
    });

    transaction(entries);
    this.logger.info({ ticketKey, promoted, skipped, total: entries.length }, 'promoteOnMerge completed');
    return { promoted, skipped };
  }
}
