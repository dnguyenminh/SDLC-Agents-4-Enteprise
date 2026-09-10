/**
 * SA4E-101 — CleanupScheduler: periodic job (every 10 minutes) that deletes
 * terminal index-operation records older than 1 hour (BR-05). Never deletes
 * `running` or `interrupted` records (BR-06).
 */

import pino from 'pino';
import { IndexOperationRepository } from '../../database/repositories/IndexOperationRepository.js';
import { ensureSa4e301GraphEdges } from '../../database/schema-registry/ensure-sa4e-301.js';

const logger = pino({ name: 'cleanup-scheduler' });

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RETENTION_HOURS = 1;

export class CleanupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly repo: IndexOperationRepository = new IndexOperationRepository()) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch(() => undefined);
    }, INTERVAL_MS);
    // First pass shortly after boot (non-blocking).
    setTimeout(() => {
      this.runOnce().catch(() => undefined);
    }, 5000);
    logger.info('[cleanup-scheduler] started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[cleanup-scheduler] stopped');
    }
  }

  async runOnce(): Promise<void> {
    try {
      const deleted = await this.repo.deleteTerminalOlderThan(RETENTION_HOURS);
      if (deleted > 0) {
        logger.info({ deleted }, '[cleanup-scheduler] removed terminal records older than 1h');
      }
    } catch (err) {
      logger.warn({ err }, '[cleanup-scheduler] cleanup pass failed (non-fatal)');
    }
    // SA4E-301: auto-heal KB Graph edges
    try {
      await ensureSa4e301GraphEdges();
    } catch (err) {
      logger.warn({ err }, '[cleanup-scheduler] graph edges heal failed (non-fatal)');
    }
  }
}
