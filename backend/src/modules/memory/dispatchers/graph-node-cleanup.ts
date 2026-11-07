/**
 * SA4E-394 — graph-node cleanup extracted from crud-ingest-file.ts (line-count
 * gate). Deletes graph_nodes rows for stale knowledge entries of a re-ingested
 * file. Non-fatal: failures are logged at debug (best-effort cleanup).
 */

import { getDbAdapter } from '../../../admin/db/core.js';
import type { MemoryEngine } from '../engine/core.js';
import { logger } from './crud-shared.js';

/** Delete graph nodes for entries previously ingested from `filePath`. */
export async function deleteStaleGraphNodes(
  engine: MemoryEngine,
  filePath: string,
  projectId: string | null,
): Promise<void> {
  try {
    const adminAdapter = getDbAdapter();
    const oldIds = projectId === null
      ? await engine.getAdapter().allAsync<{ id: number }>(
          'SELECT id FROM knowledge_entries WHERE source = $1',
          [filePath],
        )
      : await engine.getAdapter().allAsync<{ id: number }>(
          'SELECT id FROM knowledge_entries WHERE source = $1 AND project_id = $2',
          [filePath, projectId],
        );
    if (oldIds.length > 0) {
      const idList = oldIds.map(r => `'doc-${r.id}'`).join(',');
      await adminAdapter.runAsync(`DELETE FROM graph_nodes WHERE entry_id IN (${idList})`, []);
    }
  } catch (err) {
    logger.debug({ err }, '[ingest-file] Failed to delete stale graph nodes (non-fatal)');
  }
}
