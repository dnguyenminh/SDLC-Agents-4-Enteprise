/**
 * SA4E-51 — Full sync and bulk node/edge creation for KB Graph.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 * Accepts DatabaseAdapter so writes go to the active engine (SQLite or PostgreSQL).
 * processCodeSymbols reads symbols via getIndexAdapter() — same engine as the indexer.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { getKbEntries } from '../../../admin/admin-db.js';
import { getIndexAdapter } from '../../../admin/db/core.js';
import { loadConfig } from '../../../config/index.js';
import { KIND_TO_TYPE } from './constants.js';
import { computePositionByIndex } from './nodes.js';
import { buildSpatialEdges, buildCrossClusterEdges } from './spatial.js';

type EntryRow = { id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string };

/**
 * Bulk-insert nodes into graph_nodes using position math.
 * SA4E-53: uses transactionAsync + runAsync for PostgreSQL compatibility.
 * @param entries - Flat list of nodes to upsert
 * @param db - DatabaseAdapter (write target)
 * @param projectId - Default project ID when entry has none
 * @returns Number of nodes inserted/replaced
 */
export async function insertAllNodes(entries: EntryRow[], db: DatabaseAdapter, projectId = ''): Promise<number> {
  const n = entries.length;
  const typeGroups = new Map<string, number>();
  let typeGroupCounter = 0;
  const totalGroups = Math.max(...entries.map(e => e.groupId ?? 0)) + 1 || 1;

  function resolveGroupId(e: EntryRow): number {
    if (e.groupId !== undefined) return e.groupId;
    const t = e.type.toUpperCase();
    if (!typeGroups.has(t)) typeGroups.set(t, typeGroupCounter++);
    return typeGroups.get(t)!;
  }

  let created = 0;
  const CHUNK = 5000; // Optimal batch for SQLite WAL throughput
  for (let start = 0; start < n; start += CHUNK) {
    const chunk = entries.slice(start, start + CHUNK);
    await db.transactionAsync(async () => {
      for (let ci = 0; ci < chunk.length; ci++) {
        const entry = chunk[ci];
        const type = entry.type.toUpperCase();
        const gId = resolveGroupId(entry);
        const pos = computePositionByIndex(start + ci, n, type, gId, totalGroups);
        await db.runAsync(
          'INSERT OR REPLACE INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [entry.id, entry.label.substring(0, 60), type, entry.tier, entry.projectId || projectId,
           pos.x, pos.y, pos.z, pos.level, pos.clusterId],
        );
        created++;
      }
    });
  }
  return created;
}

/**
 * Sync a prepared entry list into graph_nodes then rebuild spatial/cluster edges.
 * SA4E-53: async for PostgreSQL compatibility.
 * @param entries - Prepared node list
 * @param db - DatabaseAdapter (write target)
 * @param logger - Pino logger
 * @param projectId - Default project ID
 */
export async function syncFromEntries(
  entries: EntryRow[], db: DatabaseAdapter, logger: Logger, projectId = '',
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  const nodesCreated = await insertAllNodes(entries, db, projectId);
  const spatialEdges = await buildSpatialEdges(db);
  const clusterEdges = await buildCrossClusterEdges(db);
  const edgesCreated = spatialEdges + clusterEdges;
  logger.info({ nodesCreated, edgesCreated }, 'syncFromEntries complete');
  return { nodesCreated, edgesCreated };
}

/** Collect KB document entries via the async getKbEntries API. */
async function processKbEntries(
  allEntries: EntryRow[], sources: Record<string, number>,
  ksaGroupMap: Map<string, number>, groupCounter: { value: number }, logger: Logger,
): Promise<void> {
  const serverProjectId = loadConfig().projectId;
  const docResult = await getKbEntries(1, 100000, 'created_at', 'desc', serverProjectId);

  function getKsaGroupId(source: string | null | undefined): number {
    if (!source) return 0;
    const m = source.match(/KSA-\d+/i);
    const key = m ? m[0].toUpperCase() : 'MISC';
    if (!ksaGroupMap.has(key)) ksaGroupMap.set(key, groupCounter.value++);
    return ksaGroupMap.get(key)!;
  }

  for (const entry of docResult.items) {
    const type = (entry.type || 'DOCUMENT').toUpperCase();
    const label = ((entry.summary || entry.tags || '').substring(0, 50)) ||
      (entry.source || '').split('/').pop() || `Doc ${entry.id}`;
    allEntries.push({
      id: `doc-${entry.id}`, label, type, tier: entry.tier || 'SHARED',
      groupId: getKsaGroupId(entry.source),
      projectId: entry.project_id || serverProjectId,
    });
    sources[type] = (sources[type] || 0) + 1;
  }
  logger.info({ count: docResult.items.length }, 'Collected knowledge entries');
}

/** Map one symbol row to an entry, grouping by source module. */
function processSymbolRow(
  sym: any, allEntries: EntryRow[], sources: Record<string, number>,
  ksaGroupMap: Map<string, number>, groupCounter: { value: number },
): void {
  const type = KIND_TO_TYPE[sym.kind] || 'CODE_ENTITY';
  const fileSuffix = sym.file_path ? sym.file_path.replace(/\\/g, '/').split('/').pop() || '' : '';
  const label = `${sym.name} (${fileSuffix})`.substring(0, 60);
  const fileParts = (sym.file_path || '').replace(/\\/g, '/').split('/');
  const srcIdx = fileParts.lastIndexOf('src');
  const module = srcIdx >= 0 && fileParts[srcIdx + 1] ? fileParts[srcIdx + 1] : 'code';
  const moduleKey = `MODULE-${module}`;
  if (!ksaGroupMap.has(moduleKey)) ksaGroupMap.set(moduleKey, groupCounter.value++);
  allEntries.push({
    id: `sym-${sym.id}`, label, type, tier: 'CODE',
    groupId: ksaGroupMap.get(moduleKey), projectId: loadConfig().projectId,
  });
  sources[type] = (sources[type] || 0) + 1;
}

/**
 * Read code symbols from the index adapter — same engine as the indexer.
/**
 * Read code symbols from the index adapter.
 * SA4E-53: converted to async for PostgreSQL compatibility.
 */
async function processCodeSymbols(
  allEntries: EntryRow[], sources: Record<string, number>,
  ksaGroupMap: Map<string, number>, groupCounter: { value: number }, logger: Logger,
): Promise<void> {
  try {
    const adapter = getIndexAdapter();
    const INCLUDE_KINDS = ['function', 'class', 'interface', 'method', 'type', 'enum', 'constructor'];
    const placeholders = INCLUDE_KINDS.map(() => '?').join(',');
    const rows = await adapter.allAsync<any>(
      `SELECT s.id, s.name, s.kind, f.path as file_path, f.language
       FROM symbols s LEFT JOIN files f ON f.id = s.file_id
       WHERE s.kind IN (${placeholders})`,
      INCLUDE_KINDS,
    );
    for (const sym of rows) processSymbolRow(sym, allEntries, sources, ksaGroupMap, groupCounter);
    logger.info({ symbolCount: rows.length }, 'Collected code symbols');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Failed to read code symbols — skipping');
  }
}

/**
 * Full graph sync: collect all KB entries + code symbols, then bulk-insert.
 * @param db - DatabaseAdapter to write graph_nodes/graph_edges
 * @param logger - Pino logger
 */
export async function fullSync(
  db: DatabaseAdapter, logger: Logger,
): Promise<{ nodesCreated: number; edgesCreated: number; sources: Record<string, number> }> {
  const startTime = Date.now();
  const allEntries: EntryRow[] = [];
  const ksaGroupMap = new Map<string, number>();
  const groupCounter = { value: 0 };
  const sources: Record<string, number> = {};

  await processKbEntries(allEntries, sources, ksaGroupMap, groupCounter, logger);
  await processCodeSymbols(allEntries, sources, ksaGroupMap, groupCounter, logger);

  const result = await syncFromEntries(allEntries, db, logger);
  const elapsed = Date.now() - startTime;
  logger.info({ ...result, sources, elapsed: `${elapsed}ms` }, 'Full graph sync complete');
  return { ...result, sources };
}
