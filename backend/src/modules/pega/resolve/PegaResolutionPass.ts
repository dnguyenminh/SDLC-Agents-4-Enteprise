/**
 * PegaResolutionPass.ts — SA4E-237 (GD5). Project-wide semantic resolution pass.
 *
 * Runs AFTER all rules are indexed (Phase 2). Steps:
 *   1. Read every indexed Pega symbol -> build a SymbolIndex (type+name -> candidates).
 *   2. For each staged reference row, classify it (resolved/external/ambiguous) and persist
 *      the outcome + resolved target_symbol_id.
 *   3. Project the resolved graph: external targets become `pega-ext:{fqn}` nodes; each
 *      reference becomes a PEGA_REF (resolved) or PEGA_UNRESOLVED (external/ambiguous) edge.
 *
 * Non-fatal by contract: any failure is logged and swallowed so it never breaks an index run.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import { PegaResolutionStore } from '../storage/PegaResolutionStore.js';
import { SymbolIndex, resolveOneRef, type SymbolCandidate } from './PegaResolutionResolver.js';
import { parseFqn } from '../pega-mapping.js';
import type { Logger } from 'pino';

/** Summary counters for a resolution pass. */
export interface ResolutionPassStats {
  refs: number;
  resolved: number;
  external: number;
  ambiguous: number;
  unresolved: number;
}

/**
 * Run the resolution pass for a project. Reads staged references, resolves them against the
 * indexed symbol set, persists outcomes, and projects graph nodes/edges.
 * @param adapter Database adapter
 * @param projectId Tenant project id
 * @param logger Logger
 * @returns Pass statistics
 */
export async function runResolutionPass(
  adapter: DatabaseAdapter,
  projectId: string,
  logger: Logger,
): Promise<ResolutionPassStats> {
  const store = new PegaResolutionStore(adapter);
  const stats: ResolutionPassStats = { refs: 0, resolved: 0, external: 0, ambiguous: 0, unresolved: 0 };

  const index = await buildSymbolIndex(adapter, projectId);
  const staged = await store.listByProject(projectId);

  for (const row of staged) {
    stats.refs++;
    const res = resolveOneRef(row.targetFqn, parseFqn(row.sourceFqn).pyClassName, index);
    await store.updateResolution(row.id!, res.status, res.targetSymbolId, res.detail);
    stats[res.status]++;
  }

  await projectResolutionGraph(adapter, projectId, logger);
  logger.debug({ projectId, ...stats }, 'Pega resolution pass complete');
  return stats;
}

/** Read all indexed Pega symbols for a project and build the lookup index. */
async function buildSymbolIndex(adapter: DatabaseAdapter, projectId: string): Promise<SymbolIndex> {
  const rows = await adapter.allAsync<{ id: number; signature: string }>(
    `SELECT id, signature FROM symbols WHERE project_id = ? AND kind LIKE 'pega_%'`,
    [projectId],
  );
  const candidates: SymbolCandidate[] = rows.map((r) => {
    const p = parseFqn(r.signature);
    return {
      symbolId: r.id,
      fqn: r.signature,
      pxObjClass: p.pxObjClass,
      pyClassName: p.pyClassName,
      pyRuleName: p.pyRuleName,
    };
  });
  return SymbolIndex.build(candidates);
}

/**
 * Project resolution rows into the graph. Idempotent: deletes prior `pega-ext:%` nodes and
 * PEGA_REF/PEGA_UNRESOLVED edges for the project's sources before re-inserting.
 */
async function projectResolutionGraph(
  adapter: DatabaseAdapter,
  projectId: string,
  logger: Logger,
): Promise<void> {
  try {
    const dialect = new DialectHelper(adapter.getEngine());
    const rows = await new PegaResolutionStore(adapter).listByProject(projectId);

    // Idempotent cleanup for re-runs.
    await adapter.runAsync(
      "DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'pega-ext:%'",
      [projectId],
    );
    await adapter.runAsync(
      "DELETE FROM graph_edges WHERE rel_type IN ('PEGA_REF','PEGA_UNRESOLVED') AND source LIKE 'code:%'",
      [],
    );

    const nodeSql = dialect.insertIgnore(
      'graph_nodes',
      ['entry_id', 'label', 'type', 'tier', 'project_id', 'x', 'y', 'z', 'level', 'cluster_id'],
      'entry_id',
    );
    const edgeSql = dialect.insertIgnore(
      'graph_edges',
      ['source', 'target', 'weight', 'rel_type'],
      'source, target',
    );

    for (const row of rows) {
      const source = `code:${row.sourceSymbolId}`;
      const relType = row.resolutionStatus === 'resolved' ? 'PEGA_REF' : 'PEGA_UNRESOLVED';
      const target = row.targetSymbolId ? `code:${row.targetSymbolId}` : `pega-ext:${row.targetFqn}`;

      // External/ambiguous targets are not indexed symbols — add a placeholder node.
      if (!row.targetSymbolId) {
        const label = parseFqn(row.targetFqn).pyRuleName || row.targetFqn;
        await adapter.runAsync(nodeSql, [
          target, label, 'pega_external', 'CODE', projectId, 0, 0, 0, 'micro', null,
        ]);
      }
      await adapter.runAsync(edgeSql, [source, target, 0.5, relType]);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to project Pega resolution graph (non-fatal)');
  }
}
