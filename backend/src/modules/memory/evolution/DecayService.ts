/**
 * DecayService — confidence decay background job.
 * SA4E-53: converted to async DatabaseAdapter for PostgreSQL compatibility.
 * Formula: confidence = MAX(confidence * (1 - decayRate), confidenceFloor)
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
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

export class DecayService {
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;
  private readonly logger: Logger;
  private running = false;

  constructor(adapter: DatabaseAdapter, logger: Logger) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.logger = logger.child({ service: 'decay' });
  }

  async runDecayCycle(): Promise<DecayCycleResult> {
    if (this.running) throw new Error('JOB_IN_PROGRESS');
    this.running = true;
    const start = Date.now();
    try {
      return await this.executeCycle(start);
    } finally {
      this.running = false;
    }
  }

  async getConfig(): Promise<DecayConfig> {
    const rows = await this.adapter.allAsync<{ key: string; value: string }>(
      'SELECT key, value FROM decay_config',
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return this.parseConfig(map);
  }

  async setConfig(updates: Partial<DecayConfig>): Promise<DecayConfig> {
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        await this.adapter.runAsync(
          `UPDATE decay_config SET value = ?, updated_at = ${this.dialect.now()} WHERE key = ?`,
          [String(val), key],
        );
      }
    }
    return this.getConfig();
  }

  private async executeCycle(start: number): Promise<DecayCycleResult> {
    const config = await this.getConfig();
    const threshold = this.buildThreshold(config);
    const entries = await this.fetchDecayable(config, threshold);
    let decayed = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const result = await this.processBatch(batch, config);
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

  private async fetchDecayable(
    config: DecayConfig, threshold: string,
  ): Promise<Array<{ id: number; confidence: number }>> {
    return this.adapter.allAsync<{ id: number; confidence: number }>(`
      SELECT id, confidence FROM knowledge_entries
      WHERE pinned = 0
        AND confidence > ?
        AND archived = 0
        AND (last_accessed_at < ? OR last_accessed_at IS NULL)
      ORDER BY id
    `, [config.confidenceFloor, threshold]);
  }

  private async processBatch(
    batch: Array<{ id: number; confidence: number }>,
    config: DecayConfig,
  ): Promise<{ decayed: number; skipped: number }> {
    let decayed = 0;
    const skipped = 0;
    try {
      for (const entry of batch) {
        const newConf = Math.max(
          entry.confidence * (1 - config.decayRate),
          config.confidenceFloor,
        );
        await this.adapter.runAsync(
          `UPDATE knowledge_entries SET confidence = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
          [newConf, entry.id],
        );
        decayed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn({ batchSize: batch.length, err: msg }, 'Batch failed');
      return { decayed: 0, skipped: batch.length };
    }
    return { decayed, skipped };
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
