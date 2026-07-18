/**
 * Full sync and bulk node/edge creation for KB Graph.
 */

import * as fs from 'fs';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { getAdminDb, getKbEntries } from '../../../admin/admin-db.js';
import { getIndexDbPath } from '../../../admin/db/core.js';
import { loadConfig } from '../../../config/index.js';
import { KIND_TO_TYPE } from './constants.js';
import { computePositionByIndex } from './nodes.js';
import { buildSpatialEdges, buildCrossClusterEdges } from './spatial.js';

export function insertAllNodes(entries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string }>, db: Database.Database, projectId = ''): number {
  const n = entries.length;
  const typeGroups = new Map<string, number>();
  let typeGroupCounter = 0;
  const totalGroups = Math.max(...entries.map(e => e.groupId ?? 0)) + 1 || 1;

  function resolveGroupId(e: { type: string; groupId?: number }): number {
    if (e.groupId !== undefined) return e.groupId;
    const t = e.type.toUpperCase();
    if (!typeGroups.has(t)) typeGroups.set(t, typeGroupCounter++);
    return typeGroups.get(t)!;
  }

  const insertNode = db.prepare('INSERT OR REPLACE INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  let created = 0;
  const CHUNK = 5000;
  for (let start = 0; start < n; start += CHUNK) {
    const chunk = entries.slice(start, start + CHUNK);
    db.transaction(() => {
      for (let ci = 0; ci < chunk.length; ci++) {
        const entry = chunk[ci];
        const type = entry.type.toUpperCase();
        const gId = resolveGroupId(entry);
        const pos = computePositionByIndex(start + ci, n, type, gId, totalGroups);
        const pid = entry.projectId || projectId;
        insertNode.run(entry.id, entry.label.substring(0, 60), type, entry.tier, pid, pos.x, pos.y, pos.z, pos.level, pos.clusterId);
        created++;
      }
    })();
  }
  return created;
}

export function syncFromEntries(entries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string }>, db: Database.Database, logger: Logger, projectId = ''): { nodesCreated: number; edgesCreated: number } {
  const nodesCreated = insertAllNodes(entries, db, projectId);
  const edgesCreated = buildSpatialEdges(db) + buildCrossClusterEdges(db);
  logger.info({ nodesCreated, edgesCreated }, 'syncFromEntries complete');
  return { nodesCreated, edgesCreated };
}

export function fullSync(logger: Logger): { nodesCreated: number; edgesCreated: number; sources: Record<string, number> } {
  const startTime = Date.now();
  const allEntries: Array<{ id: string; label: string; type: string; tier: string; groupId?: number; projectId?: string }> = [];
  const ksaGroupMap = new Map<string, number>();
  let groupCounter = 0;
  const sources: Record<string, number> = {};

  function getKsaGroupId(source: string | null | undefined): number {
    if (!source) return 0;
    const m = source.match(/KSA-\d+/i);
    const key = m ? m[0].toUpperCase() : 'MISC';
    if (!ksaGroupMap.has(key)) ksaGroupMap.set(key, groupCounter++);
    return ksaGroupMap.get(key)!;
  }

  function processKbEntries(): void {
    const serverProjectId = loadConfig().projectId;
    const docResult = getKbEntries(1, 100000, 'created_at', 'desc', serverProjectId);
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

  function processSymbolRow(sym: any): void {
    const type = KIND_TO_TYPE[sym.kind] || 'CODE_ENTITY';
    const fileSuffix = sym.file_path ? sym.file_path.replace(/\\/g, '/').split('/').pop() || '' : '';
    const label = `${sym.name} (${fileSuffix})`.substring(0, 60);
    const fileParts = (sym.file_path || '').replace(/\\/g, '/').split('/');
    const srcIdx = fileParts.lastIndexOf('src');
    const module = srcIdx >= 0 && fileParts[srcIdx + 1] ? fileParts[srcIdx + 1] : 'code';
    const moduleKey = `MODULE-${module}`;
    if (!ksaGroupMap.has(moduleKey)) ksaGroupMap.set(moduleKey, groupCounter++);
    allEntries.push({ id: `sym-${sym.id}`, label, type, tier: 'CODE', groupId: ksaGroupMap.get(moduleKey), projectId: loadConfig().projectId });
    sources[type] = (sources[type] || 0) + 1;
  }

  function readSymbolBatches(indexDb: Database.Database): void {
    const INCLUDE_KINDS = ['function', 'class', 'interface', 'method', 'type', 'enum', 'constructor'];
    const placeholders = INCLUDE_KINDS.map(() => '?').join(',');
    const BATCH = 10000;
    let offset = 0, batchCount = 0;
    while (true) {
      const rows = indexDb.prepare(`SELECT s.id, s.name, s.kind, f.path, f.language FROM symbols s LEFT JOIN files f ON f.id = s.file_id WHERE s.kind IN (${placeholders}) ORDER BY s.id ASC LIMIT ? OFFSET ?`)
        .all(...INCLUDE_KINDS, BATCH, offset) as any[];
      if (rows.length === 0) break;
      for (const sym of rows) processSymbolRow(sym);
      batchCount += rows.length;
      offset += BATCH;
      if (rows.length < BATCH) break;
    }
    logger.info({ symbolCount: batchCount }, 'Collected code symbols');
  }

  function processCodeSymbols(): void {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) {
      logger.warn({ indexDbPath }, 'index.db not found — skipping code symbols');
      return;
    }
    try {
      const indexDb = new Database(indexDbPath, { readonly: true });
      const hasTables = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('symbols','files')").get() as any;
      if (hasTables && hasTables.cnt >= 2) readSymbolBatches(indexDb);
      indexDb.close();
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to read code symbols from index.db — skipping');
    }
  }

  processKbEntries();
  processCodeSymbols();
  const result = syncFromEntries(allEntries, getAdminDb(), logger);
  const elapsed = Date.now() - startTime;
  logger.info({ ...result, sources, elapsed: `${elapsed}ms` }, 'Full graph sync complete');
  return { ...result, sources };
}
