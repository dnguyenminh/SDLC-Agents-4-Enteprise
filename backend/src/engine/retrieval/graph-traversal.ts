/**
 * SA4E-415 — Graph traversal with cycle guard, node cap, stable ordering
 * (16K Doc §11 — graph query rules).
 *
 * All queries are snapshot-scoped (WHERE snapshot_id = ?). Neighbor expansion
 * order is deterministic: ORDER BY kind, id — same input always yields the
 * same traversal order (stable ordering requirement).
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { EvidenceKind } from './retrieval-types.js';

export interface GraphNode {
  id: string;
  name: string;
  kind: string;
  depth: number;
  evidence: EvidenceKind;
}

export interface GraphBfsOptions {
  maxDepth?: number;
  nodeCap?: number;
  /** Relationship kinds to follow (default: all). */
  kinds?: string[];
}

interface EdgeRow {
  id: string;
  from_symbol_id: string;
  to_symbol_id: string | null;
  kind: string;
  evidence: EvidenceKind;
}

/** Direct = at least one PROVEN relationship_evidence; otherwise inferred. */
async function edgesFrom(
  db: QueryDatabaseAdapter,
  snapshotId: string,
  symbolId: string,
  kinds?: string[],
): Promise<EdgeRow[]> {
  const kindFilter = kinds && kinds.length > 0
    ? `AND r.kind IN (${kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const rows = await db.allAsync<EdgeRow>(
    `SELECT r.id, r.from_symbol_id, r.to_symbol_id, r.kind,
            CASE WHEN ev.id IS NOT NULL THEN 'direct' ELSE 'inferred' END AS evidence
     FROM symbol_relationship r
     LEFT JOIN relationship_evidence ev
       ON ev.relationship_id = r.id AND ev.evidence_kind = 'PROVEN'
     WHERE r.snapshot_id = ? AND r.from_symbol_id = ? ${kindFilter}
     ORDER BY r.kind, r.id`,
    [snapshotId, symbolId],
  );
  return rows;
}

/**
 * BFS over symbol_relationship, both directions, with:
 *  - cycle guard: visited set — a node is expanded at most once
 *  - node cap: traversal stops after `nodeCap` nodes (root excluded from cap)
 *  - stable ordering: edges sorted (kind, id); result sorted (depth, name, id)
 */
export async function bfsGraph(
  db: QueryDatabaseAdapter,
  snapshotId: string,
  rootSymbolId: string,
  opts: GraphBfsOptions = {},
): Promise<GraphNode[]> {
  const maxDepth = opts.maxDepth ?? 2;
  const nodeCap = opts.nodeCap ?? 50;
  const visited = new Set<string>([rootSymbolId]);
  const out: GraphNode[] = [];

  let frontier: Array<{ id: string; depth: number }> = [{ id: rootSymbolId, depth: 0 }];

  while (frontier.length > 0 && out.length < nodeCap) {
    const next: Array<{ id: string; depth: number; name: string; kind: string; evidence: EvidenceKind }> = [];
    for (const { id, depth } of frontier) {
      const edges = await edgesFrom(db, snapshotId, id, opts.kinds);
      for (const edge of edges) {
        const neighborId = edge.to_symbol_id ?? edge.from_symbol_id;
        if (!neighborId || visited.has(neighborId)) continue; // cycle guard
        const meta = await db.getAsync<{ name: string; kind: string }>(
          `SELECT name, kind FROM code_symbol WHERE id = ? AND snapshot_id = ?`,
          [neighborId, snapshotId],
        );
        if (!meta) continue;
        visited.add(neighborId);
        if (out.length < nodeCap) {
          out.push({ id: neighborId, name: meta.name, kind: meta.kind, depth: depth + 1, evidence: edge.evidence });
          next.push({ id: neighborId, depth: depth + 1, name: meta.name, kind: meta.kind, evidence: edge.evidence });
        }
      }
      if (out.length >= nodeCap) break;
    }
    if (out.length >= nodeCap) break;
    // stable ordering before next expansion
    next.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    frontier = next.map((n) => ({ id: n.id, depth: n.depth }));
    if (frontier.some((n) => n.depth >= maxDepth)) frontier = [];
  }
  out.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return out;
}
