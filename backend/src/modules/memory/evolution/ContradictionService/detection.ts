/**
 * Contradiction detection pipeline for ContradictionService.
 * Extracted (BR-18) — free functions taking dependencies explicitly; no behavior change.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';
import type { InstinctConfigService } from '../InstinctConfigService.js';
import type { ContradictionEntry, ContradictionReport } from '../ContradictionService.js';
import { classifyRelationship, textSimilarity } from './similarity.js';

/**
 * Detect contradictions for a newly ingested entry.
 * Compares content against same-project entries using bigram similarity.
 * Gracefully degrades when embeddings unavailable.
 */
export async function detectContradictions(
  adapter: DatabaseAdapter,
  configService: InstinctConfigService,
  logger: Logger,
  entryId: number, projectId?: string,
): Promise<ContradictionReport> {
  const config = await configService.getInstinctConfig();
  const threshold = config.contradiction_similarity_threshold;

  const entry = await adapter.getAsync<{ id: number; content: string }>(
    'SELECT id, content FROM knowledge_entries WHERE id = ?', [entryId],
  );
  if (!entry) {
    return { contradictions: [], supplements: 0, superseded: 0 };
  }

  const candidates = await fetchCandidates(adapter, entryId, projectId);
  const report: ContradictionReport = {
    contradictions: [], supplements: 0, superseded: 0,
  };

  for (const candidate of candidates) {
    const similarity = textSimilarity(entry.content, candidate.content);
    if (similarity < threshold) continue;

    const classification = classifyRelationship(
      entry.content, candidate.content, similarity,
    );

    if (classification === 'SUPPLEMENT') {
      report.supplements++;
      continue;
    }

    const logEntry = await insertLog(
      adapter, entryId, candidate.id, similarity, classification, projectId,
    );
    if (classification === 'SUPERSEDE') report.superseded++;
    report.contradictions.push(logEntry);
  }

  if (report.contradictions.length > 0) {
    logger.info(
      { entryId, count: report.contradictions.length },
      'Contradictions detected',
    );
  }
  return report;
}

async function fetchCandidates(
  adapter: DatabaseAdapter, excludeId: number, projectId?: string,
): Promise<Array<{ id: number; content: string }>> {
  let sql = `SELECT id, content FROM knowledge_entries WHERE id != ? AND archived = 0`;
  const params: unknown[] = [excludeId];
  if (projectId) {
    sql += ` AND (project_id = ? OR project_id IS NULL)`;
    params.push(projectId);
  }
  sql += ` ORDER BY id DESC LIMIT 50`;
  return adapter.allAsync<{ id: number; content: string }>(sql, params);
}

async function insertLog(
  adapter: DatabaseAdapter,
  entryIdA: number, entryIdB: number,
  similarity: number, classification: 'CONTRADICTION' | 'SUPPLEMENT' | 'SUPERSEDE',
  projectId?: string,
): Promise<ContradictionEntry> {
  const result = await adapter.runAsync(
    `INSERT INTO contradiction_log (entry_id_a, entry_id_b, similarity, classification, project_id)
     VALUES (?, ?, ?, ?, ?)`,
    [entryIdA, entryIdB, similarity, classification, projectId ?? null],
  );
  const id = result.lastInsertRowid as number;
  return {
    id, entry_id_a: entryIdA, entry_id_b: entryIdB,
    similarity, classification, status: 'unresolved',
  };
}
