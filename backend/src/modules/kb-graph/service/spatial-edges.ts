/**
 * SA4E-51 — Spatial proximity + cross-cluster edge building for KB Graph.
 * Extracted from spatial.ts: voxel bucketing (150-unit grid) and hub links.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** Build spatial grid buckets (150-unit voxels) from all graph_nodes. */
async function buildBuckets(db: DatabaseAdapter) {
  type NodeRow = { entry_id: string; x: number; y: number; z: number; cluster_id: string; type: string };
  const allNodeRows = await db.allAsync<NodeRow>(
    'SELECT entry_id, x, y, z, cluster_id, type FROM graph_nodes', [],
  );
  const buckets = new Map<string, NodeRow[]>();
  for (const row of allNodeRows) {
    const key = `${Math.floor(row.x / 150)},${Math.floor(row.y / 150)},${Math.floor(row.z / 150)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return buckets;
}

/** Insert SPATIAL edges for nodes that share a voxel bucket. */
async function insertSpatialEdges(
  buckets: Map<string, { entry_id: string }[]>, db: DatabaseAdapter,
): Promise<number> {
  let edgesCreated = 0;
  await db.transactionAsync(async () => {
    for (const [, members] of buckets) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < Math.min(members.length, i + 4); j++) {
          await db.runAsync(
            'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
            [members[i].entry_id, members[j].entry_id, 0.7, 'SPATIAL'],
          );
          edgesCreated++;
        }
      }
    }
  });
  return edgesCreated;
}

/**
 * Build spatial proximity edges between nodes in the same voxel.
 * @returns Number of edges created
 */
export async function buildSpatialEdges(db: DatabaseAdapter): Promise<number> {
  return insertSpatialEdges(await buildBuckets(db), db);
}

/**
 * Build cross-cluster hub edges (one representative per cluster).
 * @returns Number of edges created
 */
export async function buildCrossClusterEdges(db: DatabaseAdapter): Promise<number> {
  type NodeRow = { entry_id: string; cluster_id: string };
  const allNodeRows = await db.allAsync<NodeRow>(
    'SELECT entry_id, cluster_id FROM graph_nodes', [],
  );
  const clusterMap = new Map<string, string>();
  for (const row of allNodeRows) {
    const cid = row.cluster_id || 'default';
    if (!clusterMap.has(cid)) clusterMap.set(cid, row.entry_id);
  }
  const hubs = Array.from(clusterMap.values());
  let edgesCreated = 0;
  await db.transactionAsync(async () => {
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < Math.min(hubs.length, i + 5); j++) {
        await db.runAsync(
          'INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?) ON CONFLICT (source, target) DO NOTHING',
          [hubs[i], hubs[j], 0.5, 'CLUSTER_LINK'],
        );
        edgesCreated++;
      }
    }
  });
  return edgesCreated;
}
