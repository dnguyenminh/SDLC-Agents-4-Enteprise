/**
 * SA4E-158 — PegaKbSync: Phase 2 of separated ingest pipeline.
 * SA4E-171 (cutover): rules are indexed directly into symbols (kind pega_*)
 * by PegaIndexer → PegaSymbolSync. This phase no longer writes
 * PEGA_RULE/PEGA_DATA/PEGA_INDEX/PEGA_AST into knowledge_entries.
 * Remaining duties: project Pega symbols as code graph nodes.
 */
import type { MemoryEngine } from '../memory/engine/core.js';
import type { PegaParser } from './PegaParser.js';
import type { PegaDeclarativeEngine } from './PegaDeclarativeEngine.js';
import pino from 'pino';

const logger = pino({ name: 'pega-kb-sync' });

/** Result of syncing a single indexed rule (symbol-based). */
export interface SyncRuleResult {
  status: 'success' | 'error';
  fqn: string;
  symbolId: number;
  error?: string;
}

/** Summary of batch sync operation */
export interface SyncBatchResult {
  synced: number;
  skipped: number;
  errors: number;
  details: SyncRuleResult[];
}

/**
 * Sync all indexed Pega rules for a project.
 * Enumerates symbols (kind pega_*) and projects them as code graph nodes
 * via GraphSyncService.syncProjectSymbols(). No knowledge_entries writes.
 * Parser/declarativeEngine are retained for backwards-compatible signature
 * only — enrichment + Declare Expressions are handled at index time.
 */
export async function syncAllIndexedRules(
  memoryEngine: MemoryEngine,
  _parser: PegaParser,
  _declarativeEngine: PegaDeclarativeEngine,
  projectId: string,
): Promise<SyncBatchResult> {
  const adapter = memoryEngine.getAdapter();

  const rows = await adapter.allAsync<{ id: number; name: string; signature: string }>(
    `SELECT s.id, s.name, s.signature
     FROM symbols s
     WHERE s.project_id = $1 AND s.kind LIKE 'pega_%'`,
    [projectId],
  );

  const result: SyncBatchResult = { synced: 0, skipped: 0, errors: 0, details: [] };
  for (const row of rows) {
    result.synced++;
    result.details.push({ status: 'success', fqn: row.signature, symbolId: row.id });
  }

  // SA4E-106: Project this project's Pega symbols as code graph nodes
  await projectPegaCodeGraph(memoryEngine, projectId);

  // SA4E-237 (GD5): resolve staged references now that ALL symbols exist. Non-fatal.
  try {
    const { runResolutionPass } = await import('./resolve/PegaResolutionPass.js');
    await runResolutionPass(memoryEngine.getAdapter(), projectId, logger);
  } catch (err) {
    logger.warn({ err, projectId }, 'Pega resolution pass failed (non-fatal)');
  }

  logger.debug({ projectId, symbols: rows.length }, 'Pega symbols synced (graph + resolution)');
  return result;
}

/** Project Pega symbols (kind pega_*) into graph_nodes as code nodes (non-fatal). */
async function projectPegaCodeGraph(
  memoryEngine: MemoryEngine,
  projectId: string,
): Promise<void> {
  try {
    const { GraphSyncService } = await import('../../engine/graph/graph-sync-service.js');
    const adapter = memoryEngine.getAdapter();
    const sync = new GraphSyncService(adapter, adapter, logger);
    await sync.syncProjectSymbols(projectId);
  } catch (err) {
    logger.warn({ err }, 'Failed to project Pega symbols into code graph (non-fatal)');
  }
}