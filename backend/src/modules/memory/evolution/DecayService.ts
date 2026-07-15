/**
 * DecayService — confidence decay background job.
 * Processes entries in batches of 100 per transaction.
 * Formula: confidence = MAX(confidence * (1 - decayRate), confidenceFloor)
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';

export interface DecayConfig {
  halfLifeDays: number;
  decayRate: number;
  confidenceFloor: number;
  predictiveEnabled: boolean;
  stagnationThreshold: number;
  stagnationWindowDays: number;
  decayIntervalHours: number;
  accessThresholdDays: number;
}

export interface DecayCycleResult {
  decayed_count: number;
  duration_ms: number;
  skipped_pinned: number;
}

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export class DecayService {
  private readonly db: Database.Database;
  private readonly logger: Logger;
  private running = false;

  constructor(db: Database.Database, logger: Logger) {
    this.db = db;
    this.logger = logger.child({ service: 'decay' });
  }

  runDecayCycle(): DecayCycleResult {
    if (this.running) throw new Error('JOB_IN_PROGRESS');
    this.running = true;
    const start = Date.now();
    try {
      return this.executeCycle(start);
    } finally {
      this.running = false;
    }
  }

  getConfig(): DecayConfig {
    const rows = this.db.prepare(
      'SELECT key, value FROM decay_config',
    ).all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return this.parseConfig(map);
  }

  setConfig(updates: Partial<DecayConfig>): DecayConfig {
    const stmt = this.db.prepare(
      `UPDATE decay_config SET value = ?, updated_at = datetime('now') WHERE key = ?`,
    );
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) stmt.run(String(val), key);
    }
    return this.getConfig();
  }

  private executeCycle(start: number): DecayCycleResult {
    const config = this.getConfig();
    const threshold = this.buildThreshold(config);
    const entries = this.fetchDecayable(config, threshold);
    let decayed = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const result = this.processBatch(batch, config);
      decayed += result.decayed;
      skipped += result.skipped;
    }

    const duration_ms = Date.now() - start;
    this.logger.info({ decayed, skipped, duration_ms }, 'Decay cycle complete');
    return { decayed_count: decayed, duration_ms, skipped_pinned: skipped };
  }

  private buildThreshold(config: DecayConfig): string {
    const ms = config.accessThresholdDays * 86_400_000;
    return new Date(Date.now() - ms).toISOString();
  }

  private fetchDecayable(
    config: DecayConfig, threshold: string,
  ): Array<{ id: number; confidence: number }> {
    return this.db.prepare(`
      SELECT id, confidence FROM knowledge_entries
      WHERE pinned = 0
        AND confidence > ?
        AND archived = 0
        AND (last_accessed_at < ? OR last_accessed_at IS NULL)
      ORDER BY id
    `).all(config.confidenceFloor, threshold) as any[];
  }

  private processBatch(
    batch: Array<{ id: number; confidence: number }>,
    config: DecayConfig,
  ): { decayed: number; skipped: number } {
    let decayed = 0;
    let skipped = 0;
    const run = () => {
      const txn = this.db.transaction(() => {
        const stmt = this.db.prepare(
          `UPDATE knowledge_entries SET confidence = ?, updated_at = datetime('now') WHERE id = ?`,
        );
        for (const entry of batch) {
          const newConf = Math.max(
            entry.confidence * (1 - config.decayRate),
            config.confidenceFloor,
          );
          stmt.run(newConf, entry.id);
          decayed++;
        }
      });
      txn();
    };

    try {
      this.retryOnLocked(run);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn({ batchSize: batch.length, err: msg }, 'Batch failed');
      skipped += batch.length;
      decayed = 0;
    }
    return { decayed, skipped };
  }

  private retryOnLocked(fn: () => void): void {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try { fn(); return; } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('SQLITE_BUSY') && !msg.includes('database is locked')) throw err;
        if (attempt === MAX_RETRIES - 1) throw err;
        this.sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  private sleep(ms: number): void {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy wait for sync */ }
  }

  private parseConfig(map: Record<string, string>): DecayConfig {
    return {
      halfLifeDays: Number(map.halfLifeDays ?? '30'),
      decayRate: Number(map.decayRate ?? '0.05'),
      confidenceFloor: Number(map.confidenceFloor ?? '0.1'),
      predictiveEnabled: map.predictiveEnabled === 'true',
      stagnationThreshold: Number(map.stagnationThreshold ?? '3'),
      stagnationWindowDays: Number(map.stagnationWindowDays ?? '7'),
      decayIntervalHours: Number(map.decayIntervalHours ?? '24'),
      accessThresholdDays: Number(map.accessThresholdDays ?? '60'),
    };
  }
}
