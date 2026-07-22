/**
 * Supersession chain helper — creates SUPERSEDES edges and detects cycles.
 * Used by mem_ingest when supersedes_id is provided.
 * SA4E-53: converted to async for PostgreSQL compatibility.
 */

import type { MemoryEngine } from '../engine/core.js';
import pino from 'pino';

const logger = pino({ name: 'supersession' });
const MAX_CHAIN_DEPTH = 100;

interface ChainResult {
  ok: boolean;
  reason?: string;
}

/**
 * Create a SUPERSEDES edge from newId → oldId.
 * Updates old entry's superseded_by column.
 * Rejects if circular supersession detected.
 */
export async function createSupersessionChain(
  engine: MemoryEngine,
  newId: number,
  oldId: number,
): Promise<ChainResult> {
  const adapter = engine.getAdapter();
  const dialect = engine.getDialect();

  const target = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM knowledge_entries WHERE id = ?', [oldId],
  );
  if (!target) return { ok: false, reason: 'ENTRY_NOT_FOUND' };

  if (await detectCircular(engine, newId, oldId)) {
    logger.warn({ newId, oldId }, 'Circular supersession detected');
    return { ok: false, reason: 'CIRCULAR_SUPERSESSION' };
  }

  await adapter.runAsync(
    `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, 'SUPERSEDES', 1.0)`,
    [newId, oldId],
  );

  await adapter.runAsync(
    `UPDATE knowledge_entries SET superseded_by = ?, updated_at = ${dialect.now()} WHERE id = ?`,
    [newId, oldId],
  );

  await engine.auditLog('SUPERSEDE', oldId);
  return { ok: true };
}

/**
 * Detect circular supersession by walking the chain upward from oldId.
 * If newId is reachable from oldId via SUPERSEDES edges, it's a cycle.
 */
export async function detectCircular(
  engine: MemoryEngine,
  newId: number,
  oldId: number,
): Promise<boolean> {
  if (newId === oldId) return true;

  const adapter = engine.getAdapter();
  const visited = new Set<number>([oldId]);
  const queue = [oldId];

  let depth = 0;
  while (queue.length > 0 && depth < MAX_CHAIN_DEPTH) {
    const current = queue.shift()!;
    const parents = await adapter.allAsync<{ source_id: number }>(
      `SELECT source_id FROM knowledge_graph_edges WHERE target_id = ? AND relation = 'SUPERSEDES'`,
      [current],
    );

    for (const parent of parents) {
      if (parent.source_id === newId) return true;
      if (!visited.has(parent.source_id)) {
        visited.add(parent.source_id);
        queue.push(parent.source_id);
      }
    }
    depth++;
  }

  return false;
}
