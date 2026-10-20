/**
 * KB graph query/merge/cross-sync helpers (BR-18 extraction from GraphService).
 * Pure functions over the injected adapter; the class methods delegate.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { GraphNode } from './constants.js';
import { rowToNode } from './nodes.js';

export async function searchNodes(
  db: DatabaseAdapter,
  query?: string, type?: string, tier?: string,
  limit = 20, projectId?: string,
): Promise<GraphNode[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query) {
    clauses.push('(label LIKE ? OR entry_id LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
  }
  if (type) {
    clauses.push('type = ?');
    params.push(type.toUpperCase());
  }
  if (tier) {
    clauses.push('tier = ?');
    params.push(tier);
  }
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.allAsync<any>(
    `SELECT * FROM graph_nodes ${where} ORDER BY label ASC LIMIT ?`,
    [...params, limit],
  );
  return rows.map(rowToNode);
}

export async function getEdgesForNodeIds(
  db: DatabaseAdapter,
  ids: string[], limit = 200,
): Promise<Array<{ source: string; target: string; weight: number; type: string }>> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.allAsync<any>(
    `SELECT source, target, weight, rel_type FROM graph_edges
     WHERE source IN (${placeholders}) OR target IN (${placeholders}) LIMIT ?`,
    [...ids, ...ids, limit],
  );
  return rows.map(r => ({ source: r.source, target: r.target, weight: r.weight, type: r.rel_type }));
}

export async function getGraphStats(db: DatabaseAdapter): Promise<{
  nodeCount: number; edgeCount: number; density: number;
  typeDistribution: Record<string, number>;
}> {
  const nodeRow = await db.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_nodes');
  const edgeRow = await db.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM graph_edges');
  const nodeCount = nodeRow?.cnt ?? 0;
  const edgeCount = edgeRow?.cnt ?? 0;
  const density = nodeCount > 1
    ? Math.round((edgeCount / (nodeCount * (nodeCount - 1) / 2)) * 100000) / 100000
    : 0;

  const typeRows = await db.allAsync<{ type: string; cnt: number }>(
    'SELECT type, COUNT(*) as cnt FROM graph_nodes GROUP BY type ORDER BY cnt DESC',
  );
  const typeDistribution: Record<string, number> = {};
  for (const r of typeRows) typeDistribution[r.type] = r.cnt;

  return { nodeCount, edgeCount, density, typeDistribution };
}

/**
 * Multi-agent graph merge — combine nodes/edges from multiple projects.
 * Returns a read-only merged graph view with conflict resolution notes.
 */
export async function mergeGraph(
  db: DatabaseAdapter,
  projectIds: string[],
): Promise<{
  nodes: Array<any>;
  edges: Array<any>;
  stats: { totalNodes: number; totalEdges: number; projectCount: number; conflicts: number };
}> {
  if (projectIds.length === 0) return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, projectCount: 0, conflicts: 0 } };

  const placeholders = projectIds.map(() => '?').join(',');
  const nodes = await db.allAsync<any>(
    `SELECT * FROM graph_nodes WHERE project_id IN (${placeholders}) ORDER BY label ASC`,
    projectIds,
  );

  const nodeIds = nodes.map((n: any) => n.entry_id);
  if (nodeIds.length === 0) {
    return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, projectCount: projectIds.length, conflicts: 0 } };
  }
  const edgePlaceholders = nodeIds.map(() => '?').join(',');
  const edges = await db.allAsync<any>(
    `SELECT * FROM graph_edges WHERE source IN (${edgePlaceholders}) OR target IN (${edgePlaceholders})`,
    [...nodeIds, ...nodeIds],
  );

  const labelProjects = new Map<string, Set<string>>();
  const conflicts = new Set<string>();
  for (const n of nodes) {
    if (!labelProjects.has(n.label)) labelProjects.set(n.label, new Set());
    labelProjects.get(n.label)!.add(n.project_id || '');
    if (labelProjects.get(n.label)!.size > 1) conflicts.add(n.label);
  }

  return {
    nodes: nodes.map((n: any) => rowToNode(n)),
    edges: edges.map((r: any) => ({ source: r.source, target: r.target, weight: r.weight, type: r.rel_type })),
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      projectCount: projectIds.length,
      conflicts: conflicts.size,
    },
  };
}

/**
 * Cross-tenant sync — create edges between matching nodes across two projects.
 */
export async function crossSync(
  db: DatabaseAdapter, logger: { debug: (obj: unknown, msg: string) => void },
  sourceProjectId: string,
  targetProjectId: string,
): Promise<{ edgesCreated: number; matches: number; sourceNodes: number; targetNodes: number }> {
  const sourceNodes = await db.allAsync<any>(
    'SELECT * FROM graph_nodes WHERE project_id = ?', [sourceProjectId],
  );
  const targetNodes = await db.allAsync<any>(
    'SELECT * FROM graph_nodes WHERE project_id = ?', [targetProjectId],
  );

  if (sourceNodes.length === 0 || targetNodes.length === 0) {
    return { edgesCreated: 0, matches: 0, sourceNodes: sourceNodes.length, targetNodes: targetNodes.length };
  }

  const targetByLabel = new Map<string, any[]>();
  for (const tn of targetNodes) {
    const key = tn.label.toLowerCase();
    if (!targetByLabel.has(key)) targetByLabel.set(key, []);
    targetByLabel.get(key)!.push(tn);
  }

  let edgesCreated = 0;
  let matches = 0;

  for (const sn of sourceNodes) {
    const key = sn.label.toLowerCase();
    const matches_target = targetByLabel.get(key);
    if (!matches_target) continue;
    for (const tn of matches_target) {
      if (sn.entry_id === tn.entry_id) continue;
      matches++;
      try {
        await db.runAsync(
          'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
          [sn.entry_id, tn.entry_id, 0.8, 'CROSS_TENANT'],
        );
        edgesCreated++;
      } catch (err) { logger.debug({ err }, '[kb-graph] Cross-tenant edge insert failed (non-fatal)'); }
    }
  }

  return { edgesCreated, matches, sourceNodes: sourceNodes.length, targetNodes: targetNodes.length };
}

/** Remove all cross-tenant edges between two projects. */
export async function removeCrossEdges(
  db: DatabaseAdapter, projectIdA: string, projectIdB: string,
): Promise<{ removed: number }> {
  const aNodes = await db.allAsync<any>(
    'SELECT entry_id FROM graph_nodes WHERE project_id = ?', [projectIdA],
  );
  const bNodes = await db.allAsync<any>(
    'SELECT entry_id FROM graph_nodes WHERE project_id = ?', [projectIdB],
  );
  const aIds = aNodes.map((n: any) => n.entry_id);
  const bIds = bNodes.map((n: any) => n.entry_id);
  if (aIds.length === 0 || bIds.length === 0) return { removed: 0 };

  const aPH = aIds.map(() => '?').join(',');
  const bPH = bIds.map(() => '?').join(',');

  const result = await db.runAsync(
    `DELETE FROM graph_edges WHERE rel_type = 'CROSS_TENANT'
     AND ((source IN (${aPH}) AND target IN (${bPH})) OR (source IN (${bPH}) AND target IN (${aPH})))`,
    [...aIds, ...bIds, ...bIds, ...aIds],
  );
  return { removed: typeof result === 'object' && result !== null && 'changes' in result ? (result as any).changes : 0 };
}
