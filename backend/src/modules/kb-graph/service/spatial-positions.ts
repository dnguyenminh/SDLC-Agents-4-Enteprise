/**
 * SA4E-97 — Flat position list for 3D viewport initialisation.
 * Extracted from spatial.ts: on-the-fly Fibonacci-sphere cluster positions
 * grouped by type + real edges from graph_edges (SA4E-99: no synthetic edges).
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

type PosRow = { entry_id: string; x: number; y: number; z: number; type: string; tier: string; label: string };
type PositionNode = { id: string; x: number; y: number; z: number; type: string; tier: string; label: string };
type PositionEdge = { source: string; target: string; weight: number; type: string };

/**
 * Return flat position list for all nodes + edges (used by 3D viewport initialisation).
 * SA4E-97: Now includes edges from graph_edges table for relationship rendering.
 * @param projectId - Optional project scope
 */
export async function getAllPositions(
  db: DatabaseAdapter, projectId?: string,
): Promise<{ nodes: PositionNode[]; edges: PositionEdge[]; total: number }> {
  const projectFilter = projectId ? ' WHERE project_id = ?' : '';
  const projectArgs: unknown[] = projectId ? [projectId] : [];
  const rows = await db.allAsync<PosRow>(
    `SELECT entry_id, x, y, z, type, tier, label FROM graph_nodes${projectFilter}`, projectArgs,
  );

  // SA4E-97: Compute positions on-the-fly grouped by type for proper 3D separation
  const nodes = computeClusteredPositions(rows);

  // SA4E-97: Fetch edges for all nodes in this project
  let edges: PositionEdge[] = [];
  if (nodes.length > 0) {
    edges = await fetchVisibleEdges(db, nodes, projectFilter, projectArgs);
  }

  return { nodes, edges, total: nodes.length };
}

/** Group rows by type and lay each group out on its own Fibonacci-sphere cluster. */
function computeClusteredPositions(rows: PosRow[]): PositionNode[] {
  const golden = (1 + Math.sqrt(5)) / 2;
  const byType = new Map<string, PosRow[]>();
  for (const r of rows) {
    const t = r.type || 'UNKNOWN';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r);
  }
  const allTypes = Array.from(byType.keys());
  const totalGroups = allTypes.length;
  const clusterRadius = 1500;

  const nodes: PositionNode[] = [];
  for (let gi = 0; gi < allTypes.length; gi++) {
    const type = allTypes[gi];
    const group = byType.get(type)!;
    // Cluster center on sphere
    const phi = Math.acos(1 - 2 * (gi + 0.5) / totalGroups);
    const theta = 2 * Math.PI * gi / golden;
    const cx = clusterRadius * Math.sin(phi) * Math.cos(theta);
    const cy = clusterRadius * Math.sin(phi) * Math.sin(theta);
    const cz = clusterRadius * Math.cos(phi);
    // Local spread scales with group size
    const localSpread = Math.max(150, Math.sqrt(group.length) * 20);

    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const lp = Math.acos(1 - 2 * (i + 0.5) / group.length);
      const lt = 2 * Math.PI * i / golden;
      const lr = localSpread * Math.cbrt((i + 1) / group.length);
      nodes.push({
        id: r.entry_id,
        x: Math.round((cx + lr * Math.sin(lp) * Math.cos(lt)) * 10) / 10,
        y: Math.round((cy + lr * Math.sin(lp) * Math.sin(lt)) * 10) / 10,
        z: Math.round((cz + lr * Math.cos(lp)) * 10) / 10,
        type: r.type, tier: r.tier, label: r.label,
      });
    }
  }
  return nodes;
}

/** Fetch edges whose both endpoints are visible nodes. */
async function fetchVisibleEdges(
  db: DatabaseAdapter, nodes: PositionNode[], projectFilter: string, projectArgs: unknown[],
): Promise<PositionEdge[]> {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeRows = await db.allAsync<{ source: string; target: string; weight: number; rel_type: string }>(
    `SELECT source, target, weight, rel_type FROM graph_edges${projectFilter ? ' WHERE source IN (SELECT entry_id FROM graph_nodes' + projectFilter + ')' : ''} LIMIT 10000`,
    projectArgs,
  );
  const edges = edgeRows
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({ source: e.source, target: e.target, weight: e.weight, type: e.rel_type }));

  // SA4E-99: Only real edges from graph_edges table. No synthetic edges.
  // KB nodes will have no edges until KB edge extraction is implemented.
  return edges;
}
