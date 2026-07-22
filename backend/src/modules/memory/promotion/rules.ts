/**
 * Promotion rules — criteria evaluation for KB entry scope promotion.
 * SA4E-53: migrated from raw better-sqlite3 to DatabaseAdapter async API.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { KBScope } from '../models.js';

export interface PromotionCandidate {
  entryId: number;
  currentScope: KBScope;
  targetScope: KBScope;
  reason: string;
  score: number;
}

export interface PromotionConfig {
  minCitations: number;
  minAccessCount: number;
  minQualityScore: number;
  minAgeHours: number;
  minCriteriaMet: number;
  autoApproveToProject: boolean;
}

export const DEFAULT_CONFIG: PromotionConfig = {
  minCitations: 2,
  minAccessCount: 5,
  minQualityScore: 70,
  minAgeHours: 24,
  minCriteriaMet: 2,
  autoApproveToProject: false,
};

/**
 * Evaluate promotion criteria for a candidate entry.
 * SA4E-53: async for PostgreSQL compatibility.
 */
export async function evaluateCriteria(
  adapter: DatabaseAdapter,
  entry: any,
  config: PromotionConfig,
): Promise<{ metCount: number; reasons: string[]; score: number }> {
  const reasons: string[] = [];
  let metCount = 0;
  let score = 0;

  const citationRow = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM citations WHERE entry_id = ?',
    [entry.id],
  );
  const citationCount = citationRow?.cnt ?? 0;

  if (citationCount >= config.minCitations) {
    metCount++;
    reasons.push(`citations=${citationCount}`);
    score += 30;
  }

  if (entry.access_count >= config.minAccessCount) {
    metCount++;
    reasons.push(`access_count=${entry.access_count}`);
    score += 25;
  }

  if (entry.quality_score !== null && entry.quality_score >= config.minQualityScore) {
    metCount++;
    reasons.push(`quality=${entry.quality_score}`);
    score += 25;
  }

  const crossAgentRow = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(DISTINCT cited_by) as cnt FROM citations WHERE entry_id = ?',
    [entry.id],
  );
  const crossAgentCites = crossAgentRow?.cnt ?? 0;

  if (crossAgentCites >= 2) {
    metCount++;
    reasons.push(`cross_agent_cites=${crossAgentCites}`);
    score += 20;
  }

  return { metCount, reasons, score };
}
