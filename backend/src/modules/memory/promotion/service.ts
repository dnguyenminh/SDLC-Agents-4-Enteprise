/**
 * ScopePromotionService — manages KB entry promotion pipeline.
 * SA4E-53: migrated from a raw sync handle to the DatabaseAdapter async API for PostgreSQL compatibility.
 * BR-18 facade — scan/queue lives in ./scan-queue.ts, review actions in ./review.ts.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';
import {
  type PromotionCandidate, type PromotionConfig, DEFAULT_CONFIG,
} from './rules.js';
import {
  ensurePromotionQueueTable as ensureTable,
  scanForPromotionCandidates as scan,
  queueCandidates as queue,
} from './scan-queue.js';
import {
  listPending as listPendingRows,
  approve as approveEntry,
  reject as rejectEntry,
  requestSharedPromotion as requestShared,
  promoteOnMerge as promoteMerge,
} from './review.js';

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
    return ensureTable(this.adapter);
  }

  async scanForPromotionCandidates(limit = 50): Promise<PromotionCandidate[]> {
    return scan(this.adapter, this.logger, this.config, limit);
  }

  async queueCandidates(candidates: PromotionCandidate[]): Promise<{ queued: number; autoApproved: number }> {
    return queue(this.adapter, this.dialect, this.logger, this.config, candidates);
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
    return listPendingRows(this.adapter, limit);
  }

  async approve(entryId: number, reviewerId: string, comment: string): Promise<boolean> {
    return approveEntry(this.adapter, this.dialect, this.logger, entryId, reviewerId, comment);
  }

  async reject(entryId: number, reviewerId: string, comment: string): Promise<boolean> {
    return rejectEntry(this.adapter, this.dialect, this.logger, entryId, reviewerId, comment);
  }

  async requestSharedPromotion(entryId: number, reason: string): Promise<boolean> {
    return requestShared(this.adapter, this.logger, entryId, reason);
  }

  async promoteOnMerge(ticketKey: string): Promise<{ promoted: number; skipped: number }> {
    return promoteMerge(this.adapter, this.dialect, this.logger, ticketKey);
  }
}
