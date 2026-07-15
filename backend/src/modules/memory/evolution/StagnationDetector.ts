/**
 * StagnationDetector — analyzes search_log for stagnation patterns.
 * Identifies repeated failed queries (result_count=0) that indicate KB gaps.
 */

import type Database from 'better-sqlite3';
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
  private readonly db: Database.Database;
  private readonly logger: Logger;

  constructor(db: Database.Database, logger: Logger) {
    this.db = db;
    this.logger = logger.child({ service: 'stagnation' });
  }

  analyze(windowDays?: number, threshold?: number): StagnationReport {
    const config = this.resolveConfig(windowDays, threshold);
    const cutoff = this.buildCutoff(config.windowDays);

    if (!this.tableExists('search_log')) {
      return { stagnant_queries: [], count: 0 };
    }

    const start = Date.now();
    const rows = this.queryStagnant(cutoff, config.threshold);
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

  private resolveConfig(
    windowDays?: number, threshold?: number,
  ): { windowDays: number; threshold: number } {
    const cfg = this.readDecayConfig();
    return {
      windowDays: windowDays ?? cfg.stagnationWindowDays,
      threshold: threshold ?? cfg.stagnationThreshold,
    };
  }

  private readDecayConfig(): { stagnationWindowDays: number; stagnationThreshold: number } {
    const rows = this.db.prepare(
      "SELECT key, value FROM decay_config WHERE key IN ('stagnationWindowDays', 'stagnationThreshold')",
    ).all() as Array<{ key: string; value: string }>;
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

  private queryStagnant(cutoff: string, threshold: number): StagnantQuery[] {
    return this.db.prepare(`
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
    `).all(cutoff, threshold) as StagnantQuery[];
  }

  private tableExists(name: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
    ).get(name);
    return !!row;
  }
}
