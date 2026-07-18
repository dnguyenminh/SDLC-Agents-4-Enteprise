/**
 * Supersession chain helper — creates SUPERSEDES edges and detects cycles.
 * Used by mem_ingest when supersedes_id is provided.
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
export function createSupersessionChain(
  engine: MemoryEngine,
  newId: number,
  oldId: number,
): ChainResult {
  const db = engine.getDb() as any;

  const target = db.prepare('SELECT id FROM knowledge_entries WHERE id = ?').get(oldId);
  if (!target) return { ok: false, reason: 'ENTRY_NOT_FOUND' };

  if (detectCircular(engine, newId, oldId)) {
    logger.warn({ newId, oldId }, 'Circular supersession detected');
    return { ok: false, reason: 'CIRCULAR_SUPERSESSION' };
  }

  db.prepare(
    `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, 'SUPERSEDES', 1.0)`,
  ).run(newId, oldId);

  db.prepare(
    `UPDATE knowledge_entries SET superseded_by = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(newId, oldId);

  engine.auditLog('SUPERSEDE', oldId);
  return { ok: true };
}

/**
 * Detect circular supersession by walking the chain upward from oldId.
 * If newId is reachable from oldId via SUPERSEDES edges, it's a cycle.
 */
export function detectCircular(
  engine: MemoryEngine,
  newId: number,
  oldId: number,
): boolean {
  if (newId === oldId) return true;

  const db = engine.getDb() as any;
  const visited = new Set<number>([oldId]);
  const queue = [oldId];

  const stmt = db.prepare(
    `SELECT source_id FROM knowledge_graph_edges WHERE target_id = ? AND relation = 'SUPERSEDES'`,
  );

  let depth = 0;
  while (queue.length > 0 && depth < MAX_CHAIN_DEPTH) {
    const current = queue.shift()!;
    const parents = stmt.all(current) as Array<{ source_id: number }>;

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
