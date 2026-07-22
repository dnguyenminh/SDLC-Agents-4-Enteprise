/**
 * StagnationDetector — analyzes search_log for stagnation patterns.
 * SA4E-53: converted to async DatabaseAdapter for PostgreSQL compatibility.
 * Identifies repeated failed queries (result_count=0) that indicate KB gaps.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';

export interface StagnantQuery {
  query: string;
  count: number;
  first_seen: string;
}

export interface StagnationReport {
  stagnant_queries: StagnantQuery[];
  count: number;
}

const TIMEOUT_MS = 30_000;

export class StagnationDetector {
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;
  private readonly logger: Logger;

  constructor(adapter: DatabaseAdapter, logger: Logger) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.logger = logger.child({ service: 'stagnation' });
  }

  async analyze(windowDays?: number, threshold?: number): Promise<StagnationReport> {
    const config = await this.resolveConfig(windowDays, threshold);
    const cutoff = this.buildCutoff(config.windowDays);

    if (!(await this.tableExists('search_log'))) {
      return { stagnant_queries: [], count: 0 };
    }

    const start = Date.now();
    const rows = await this.queryStagnant(cutoff, config.threshold);
    const elapsed = Date.now() - start;

    if (elapsed > TIMEOUT_MS) {
      this.logger.warn({ elapsed }, 'Stagnation analysis timed out');
      return { stagnant_queries: [], count: 0 };
    }

    this.logger.info(
      { found: rows.length, windowDays: config.windowDays },
      'Stagnation analysis complete',
    );
    return { stagnant_queries: rows, count: rows.length };
  }

  private async resolveConfig(
    windowDays?: number, threshold?: number,
  ): Promise<{ windowDays: number; threshold: number }> {
    const cfg = await this.readDecayConfig();
    return {
      windowDays: windowDays ?? cfg.stagnationWindowDays,
      threshold: threshold ?? cfg.stagnationThreshold,
    };
  }

  private async readDecayConfig(): Promise<{ stagnationWindowDays: number; stagnationThreshold: number }> {
    const rows = await this.adapter.allAsync<{ key: string; value: string }>(
      "SELECT key, value FROM decay_config WHERE key IN ('stagnationWindowDays', 'stagnationThreshold')",
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      stagnationWindowDays: Number(map.stagnationWindowDays ?? '7'),
      stagnationThreshold: Number(map.stagnationThreshold ?? '3'),
    };
  }

  private buildCutoff(windowDays: number): string {
    const ms = windowDays * 86_400_000;
    return new Date(Date.now() - ms).toISOString();
  }

  private async queryStagnant(cutoff: string, threshold: number): Promise<StagnantQuery[]> {
    return this.adapter.allAsync<StagnantQuery>(`
      SELECT LOWER(TRIM(query)) as query,
             COUNT(*) as count,
             MIN(created_at) as first_seen
      FROM search_log
      WHERE result_count = 0
        AND created_at >= ?
      GROUP BY LOWER(TRIM(query))
      HAVING COUNT(*) >= ?
      ORDER BY count DESC
      LIMIT 50
    `, [cutoff, threshold]);
  }

  private async tableExists(name: string): Promise<boolean> {
    const engine = this.adapter.getEngine();
    if (engine === 'postgresql') {
      const row = await this.adapter.getAsync<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?) as exists`,
        [name],
      );
      return row?.exists ?? false;
    }
    // SQLite
    const row = await this.adapter.getAsync<{ n: number }>(
      "SELECT 1 as n FROM sqlite_master WHERE type='table' AND name=?",
      [name],
    );
    return !!row;
  }
}
