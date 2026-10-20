/**
 * Graph-node cleanup helpers (BR-18 split from engine/crud.ts).
 * Keeps graph_nodes consistent with source tables over time; runs on startup
 * and after entry deletion. Non-fatal by design.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/**
 * Remove orphan graph nodes whose source entities no longer exist.
 * Also removes ALL legacy 'kb-entry:*' nodes (replaced by 'doc-{id}' format).
 */
export async function reconcileOrphanGraphNodes(adapter: DatabaseAdapter): Promise<number> {
  try {
    // Remove ALL legacy 'kb-entry:*' nodes — this prefix is no longer used
    const r1 = await adapter.runAsync(
      `DELETE FROM graph_nodes WHERE entry_id LIKE 'kb-entry:%'`,
    );
    // Clean orphan 'doc-*' nodes (KB entries that were deleted)
    const r2 = await adapter.runAsync(
      `DELETE FROM graph_nodes WHERE entry_id LIKE 'doc-%'
       AND CAST(REPLACE(entry_id, 'doc-', '') AS INTEGER) NOT IN (
         SELECT id FROM knowledge_entries
       )`,
    );
    // Clean orphan 'sym-*' nodes (symbols that were deleted)
    const r3 = await adapter.runAsync(
      `DELETE FROM graph_nodes WHERE entry_id LIKE 'sym-%'
       AND CAST(REPLACE(entry_id, 'sym-', '') AS INTEGER) NOT IN (
         SELECT id FROM symbols
       )`,
    );
    // Clean orphan 'code:*' nodes (symbols re-created with a new id on re-index).
    // Without this, a graph node points at a dead symbol id and the viewer
    // shows "No content available" even though the live symbol is enriched.
    const r4 = await adapter.runAsync(
      `DELETE FROM graph_nodes WHERE entry_id LIKE 'code:%'
       AND CAST(REPLACE(entry_id, 'code:', '') AS INTEGER) NOT IN (
         SELECT id FROM symbols
       )`,
    );
    return (r1.changes ?? 0) + (r2.changes ?? 0) + (r3.changes ?? 0) + (r4.changes ?? 0);
  } catch {
    // Non-fatal: graph_nodes table may not exist in test environments
    return 0;
  }
}
