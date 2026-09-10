/**
 * SA4E-301 — Auto heal KB Graph edges
 * Finds projects with graph_nodes but zero graph_edges and backfills them from relationships.
 */

import pino from 'pino';
import { getDbAdapter, getActiveEngine } from '../../admin/db/core.js';
import { extractAndInsertCodeEdges } from '../../engine/graph/code-edge-extractor.js';
import { RelationshipsEdgeStrategy } from '../../engine/graph/code-edge-extractor.js';

const logger = pino({ name: 'sa4e-301-edges' });

export async function ensureSa4e301GraphEdges(): Promise<void> {
  const adapter = getDbAdapter();
  try {
    // Find projects with nodes but no edges
    const engine = getActiveEngine();
    const projects = await adapter.allAsync<{ project_id: string }>(
      `SELECT DISTINCT project_id FROM graph_nodes
       WHERE project_id NOT IN (SELECT DISTINCT project_id FROM graph_edges)
       LIMIT 20`,
    );
    if (!projects.length) {
      logger.debug('[sa4e-301] No projects need edge backfill');
      return;
    }

    for (const { project_id } of projects) {
      logger.info({ project_id }, '[sa4e-301] Backfilling graph edges');
      // Use admin and index adapters same instance for simplicity
      // In real run, obtain proper adapters; here use same adapter for demo
      const inserted = await extractAndInsertCodeEdges(adapter, adapter, project_id, logger);
      logger.info({ project_id, inserted }, '[sa4e-301] Edges backfilled');
    }
  } catch (err) {
    logger.warn({ err }, '[sa4e-301] Auto edge heal failed (non-fatal)');
  }
}
