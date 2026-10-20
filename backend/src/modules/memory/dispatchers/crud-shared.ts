/** Shared graph-node upsert helper for CRUD dispatchers (BR-18 extraction). */
import pino from 'pino';
import { GraphRepository } from '../../../database/repositories/GraphRepository.js';
import { getDbAdapter } from '../../../admin/db/core.js';
import { computePositionByIndex } from '../../kb-graph/service/nodes.js';

export const logger = pino({ name: 'memory-tool-dispatcher' });

/** Upsert a KB entry as a graph node (non-fatal — graph viz is secondary). */
export async function upsertGraphNode(entryId: number, summary: string, type: string, projectId: string | null): Promise<void> {
  try {
    const graphRepo = new GraphRepository(getDbAdapter());
    const nodeCount = await graphRepo.getNodeCounts(projectId || '');
    const pos = computePositionByIndex(nodeCount.total, nodeCount.total + 1, type, 0, 1);
    await graphRepo.upsertNode({
      entryId: `doc-${entryId}`, label: summary.substring(0, 60),
      type: type.toUpperCase(), tier: 'SHARED',
      projectId: projectId || '', x: pos.x, y: pos.y, z: pos.z,
      level: String(pos.level), clusterId: pos.clusterId,
    });
    logger.info({ entryId, type }, '[graph] Upserted graph node for KB entry');
  } catch (err: any) {
    logger.error({ err: err.message, entryId, type }, '[graph] Failed to upsert graph node');
  }
}
