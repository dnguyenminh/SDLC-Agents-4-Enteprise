/**
 * ContradictionService — detects semantic contradictions between KB entries
 * using cosine similarity on embedding vectors. Logs contradictions and
 * provides resolution workflows.
 * SA4E-121: Instincts and Confidence Scoring System.
 *
 * BR-18 facade — similarity math lives in ./ContradictionService/similarity.ts,
 * detection pipeline in ./ContradictionService/detection.ts.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { Logger } from 'pino';
import { InstinctConfigService } from './InstinctConfigService.js';
import { detectContradictions as runDetection } from './ContradictionService/detection.js';

/** Single contradiction entry from the log table. */
export interface ContradictionEntry {
  id: number;
  entry_id_a: number;
  entry_id_b: number;
  similarity: number;
  classification: 'CONTRADICTION' | 'SUPPLEMENT' | 'SUPERSEDE';
  status: 'unresolved' | 'resolved' | 'stale';
}

/** Report returned after contradiction detection. */
export interface ContradictionReport {
  contradictions: ContradictionEntry[];
  supplements: number;
  superseded: number;
}

/** Result of resolving a contradiction. */
export interface ResolutionResult {
  resolved: boolean;
  strategy: string;
  affected_entries: number[];
}

const VALID_RESOLUTIONS = [
  'resolve_keep_new', 'resolve_keep_old', 'resolve_merge', 'resolve_both',
] as const;

export class ContradictionService {
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;
  private readonly configService: InstinctConfigService;
  private readonly logger: Logger;

  constructor(
    adapter: DatabaseAdapter,
    configService: InstinctConfigService,
    logger: Logger,
  ) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.configService = configService;
    this.logger = logger.child({ service: 'contradiction' });
  }

  /**
   * Detect contradictions for a newly ingested entry.
   * Compares content against same-project entries using bigram similarity.
   * Gracefully degrades when embeddings unavailable.
   */
  async detectContradictions(
    entryId: number, projectId?: string,
  ): Promise<ContradictionReport> {
    return runDetection(this.adapter, this.configService, this.logger, entryId, projectId);
  }

  /**
   * Resolve a contradiction by ID. Applies resolution strategy.
   * @throws Error('INVALID_RESOLUTION') if strategy unknown.
   * @throws Error('ENTRY_NOT_FOUND') if contradiction not found.
   * @throws Error('ALREADY_RESOLVED') if already resolved.
   */
  async resolveContradiction(
    contradictionId: number, resolution: string, resolvedBy?: string,
  ): Promise<ResolutionResult> {
    if (!VALID_RESOLUTIONS.includes(resolution as any)) {
      throw new Error('INVALID_RESOLUTION');
    }

    const row = await this.adapter.getAsync<ContradictionEntry>(
      'SELECT * FROM contradiction_log WHERE id = ?', [contradictionId],
    );
    if (!row) throw new Error('ENTRY_NOT_FOUND');
    if (row.status === 'resolved') throw new Error('ALREADY_RESOLVED');

    const affected: number[] = [row.entry_id_a, row.entry_id_b];

    switch (resolution) {
      case 'resolve_keep_new':
        await this.archiveEntry(row.entry_id_a);
        break;
      case 'resolve_keep_old':
        await this.archiveEntry(row.entry_id_b);
        break;
      case 'resolve_merge':
      case 'resolve_both':
        break;
    }

    await this.adapter.runAsync(
      `UPDATE contradiction_log SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ${this.dialect.now()} WHERE id = ?`,
      [resolution, resolvedBy ?? null, contradictionId],
    );

    this.logger.info({ contradictionId, resolution }, 'Contradiction resolved');
    return { resolved: true, strategy: resolution, affected_entries: affected };
  }

  /** Get contradiction warnings for a list of entry IDs (search enhancement). */
  async getWarnings(entryIds: number[]): Promise<Map<number, string>> {
    if (entryIds.length === 0) return new Map();

    const placeholders = entryIds.map(() => '?').join(',');
    const rows = await this.adapter.allAsync<{
      entry_id_a: number; entry_id_b: number; classification: string;
    }>(
      `SELECT entry_id_a, entry_id_b, classification FROM contradiction_log
       WHERE status = 'unresolved'
         AND (entry_id_a IN (${placeholders}) OR entry_id_b IN (${placeholders}))`,
      [...entryIds, ...entryIds],
    );

    const warnings = new Map<number, string>();
    for (const row of rows) {
      const msg = `Has unresolved ${row.classification.toLowerCase()}`;
      if (entryIds.includes(row.entry_id_a)) warnings.set(row.entry_id_a, msg);
      if (entryIds.includes(row.entry_id_b)) warnings.set(row.entry_id_b, msg);
    }
    return warnings;
  }

  private async archiveEntry(entryId: number): Promise<void> {
    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET archived = 1, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [entryId],
    );
  }
}
