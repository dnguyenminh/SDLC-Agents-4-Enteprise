/**
 * KB Graph Spatial routes — 3D spatial queries for graph visualization.
 * SA4E-45: Uses getIndexAdapter() for multi-DB support.
 */

import { Hono } from 'hono';
import { getKbEntries, getKbEntryCount } from '../../../admin/admin-db.js';
import { getIndexAdapter, getActiveEngine } from '../../../admin/db/core.js';
import type { AdminContext } from './context.js';

export function createKbGraphSpatialRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/kb/graph/positions', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = ctx.requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const allowedTiers = (kbPermCheck.roleData as { allowedTiers?: string[] })?.allowedTiers;
    let kbCount = 0;
    let codeCount = 0;
    try { kbCount = getKbEntryCount(ctx.getRequestProjectId(c)); } catch { ctx.logger.warn({ context: 'kb-graph' }, 'Failed to get KB entry count'); }
    try {
      // SA4E-41: count only the requesting tenant's code symbols (fail-closed).
      // SA4E-49: Fall back to include NULL project_id entries (legacy/unscoped symbols).
      const pid = ctx.getRequestProjectId(c);
      if (pid) {
        const adapter = getIndexAdapter();
        const row = adapter.get<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM symbols WHERE project_id = ? AND kind IN ('function','class','interface','method','type','enum','constructor')",
          [pid]
        );
        codeCount = row?.cnt || 0;
        // SA4E-49: If scoped count is 0, try including NULL project_id entries
        if (codeCount === 0) {
          const fallbackRow = adapter.get<{ cnt: number }>(
            "SELECT COUNT(*) as cnt FROM symbols WHERE (project_id = ? OR project_id IS NULL) AND kind IN ('function','class','interface','method','type','enum','constructor')",
            [pid]
          );
          codeCount = fallbackRow?.cnt || 0;
        }
      }
    } catch { ctx.logger.warn({ context: 'kb-graph' }, 'Failed to count code symbols'); }
    const graphService = (globalThis as Record<string, unknown>).__sqliteGraphService as { ready?: boolean; getAllPositions?: (projectId?: string) => any } | undefined;
    if (graphService && graphService.ready) {
      try {
        const result = graphService.getAllPositions!(ctx.getRequestProjectId(c));
        if (Array.isArray(allowedTiers)) result.nodes = result.nodes.filter((n: any) => n.tier === 'CODE' || allowedTiers.includes(n.tier));
        result.kbCount = kbCount; result.codeCount = codeCount;
        return c.json(result);
      } catch (err: any) { ctx.logger.warn({ error: err.message }, 'getAllPositions failed'); }
    }
    const allEntries = getKbEntries(1, 100000, 'created_at', 'desc', ctx.getRequestProjectId(c));
    const items = allEntries.items;
    const golden = (1 + Math.sqrt(5)) / 2;
    const groups = new Map<string, number>();
    let groupCounter = 0;
    const nodes = items.map((e: any, i: number) => {
      const type = (e.type || e.content_type || 'DOCUMENT').toUpperCase();
      const tier = e.tier || e.scope || 'SHARED';
      if (!groups.has(type)) groups.set(type, groupCounter++);
      const groupId = groups.get(type)!;
      const level = ({ ARCHITECTURE: 0, REQUIREMENT: 0, DECISION: 0, PROCEDURE: 1, CONTEXT: 1, CODE_ENTITY: 1 } as Record<string, number>)[type] ?? 2;
      const theta = 2 * Math.PI * i / golden;
      const phi = Math.acos(1 - 2 * (i + 0.5) / Math.max(items.length, 1));
      const baseRadius = 300 + level * 200;
      const groupAngle = (groupId / Math.max(groupCounter, 1)) * 2 * Math.PI;
      return {
        id: e.id || e.entry_id || `node-${i}`,
        x: Math.round((baseRadius * Math.sin(phi) * Math.cos(theta) + 150 * Math.cos(groupAngle)) * 100) / 100,
        y: Math.round((baseRadius * Math.sin(phi) * Math.sin(theta) + 150 * Math.sin(groupAngle)) * 100) / 100,
        z: Math.round((baseRadius * Math.cos(phi)) * 100) / 100,
        type, tier,
        label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${i + 1}`,
      };
    });
    return c.json({ nodes, total: nodes.length });
  });

  app.get('/api/admin/kb/graph/spatial', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = ctx.requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const camX = parseFloat(c.req.query('x') || '0');
    const camY = parseFloat(c.req.query('y') || '0');
    const camZ = parseFloat(c.req.query('z') || '0');
    const zoom = parseFloat(c.req.query('zoom') || '500');
    const graphService = (globalThis as Record<string, unknown>).__sqliteGraphService as { ready?: boolean; spatialQuery?: Function } | undefined;
    if (graphService && graphService.ready) {
      try { return c.json(graphService.spatialQuery!({ camX, camY, camZ, zoom }, ctx.getRequestProjectId(c))); }
      catch (err: any) { ctx.logger.warn({ error: err.message }, 'SQLite graph spatial query failed, using inline fallback'); }
    }
    const graphPermCheck = ctx.checkPermission(user.userId, 'GRAPH_VIEW');
    const maxNodes = (graphPermCheck.roleData as { maxNodes?: number })?.maxNodes || 500;
    const allowedTiers = (kbPermCheck.roleData as { allowedTiers?: string[] })?.allowedTiers;
    const allEntries = getKbEntries(1, maxNodes, 'created_at', 'desc', ctx.getRequestProjectId(c));
    let items = allEntries.items;
    if (Array.isArray(allowedTiers)) items = items.filter((e: any) => allowedTiers.includes(e.tier || e.scope || 'SHARED'));
    items = items.slice(0, maxNodes);
    const levelMap: Record<string, number> = { ARCHITECTURE: 0, REQUIREMENT: 0, DECISION: 0, PROCEDURE: 1, CONTEXT: 1, CODE_ENTITY: 1, LESSON_LEARNED: 2, ERROR_PATTERN: 2, DOCUMENT: 2 };
    const groups = new Map<string, number>();
    let groupCounter = 0;
    const golden = (1 + Math.sqrt(5)) / 2;
    const nodes = items.map((e: any, i: number) => {
      const type = (e.type || e.content_type || 'DOCUMENT').toUpperCase();
      const tier = e.tier || e.scope || 'SHARED';
      if (!groups.has(type)) groups.set(type, groupCounter++);
      const groupId = groups.get(type)!;
      const level = levelMap[type] ?? 2;
      const theta = 2 * Math.PI * i / golden;
      const phi = Math.acos(1 - 2 * (i + 0.5) / items.length);
      const baseRadius = 100 + level * 80;
      const groupAngle = (groupId / Math.max(groupCounter, 1)) * 2 * Math.PI;
      return {
        id: e.id || e.entry_id || `node-${i}`,
        label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${i + 1}`,
        type, tier, x: Math.round((baseRadius * Math.sin(phi) * Math.cos(theta) + 50 * Math.cos(groupAngle)) * 100) / 100,
        y: Math.round((baseRadius * Math.sin(phi) * Math.sin(theta) + 50 * Math.sin(groupAngle)) * 100) / 100,
        z: Math.round((baseRadius * Math.cos(phi)) * 100) / 100,
        level, clusterId: `cluster-${groupId}`,
      };
    });
    let filteredNodes = nodes;
    if (zoom <= 500) {
      const r = Math.max(200, zoom * 0.5);
      filteredNodes = nodes.filter((nd: any) => nd.x >= camX - r && nd.x <= camX + r && nd.y >= camY - r && nd.y <= camY + r && nd.z >= camZ - r && nd.z <= camZ + r);
    }
    const edges: any[] = [];
    const clusterMap = new Map<string, any[]>();
    for (const nd of filteredNodes) {
      const cid = nd.clusterId || 'default';
      if (!clusterMap.has(cid)) clusterMap.set(cid, []);
      clusterMap.get(cid)!.push(nd);
    }
    for (const [, members] of clusterMap) {
      const hub = members[0];
      for (let i = 1; i < Math.min(members.length, 11); i++) edges.push({ source: hub.id, target: members[i].id, weight: 0.8 });
      for (let i = 1; i < members.length; i += 3) edges.push({ source: members[i - 1].id, target: members[i].id, weight: 0.5 });
    }
    const level = zoom > 500 ? 'macro' : zoom > 200 ? 'mid' : 'micro';
    return c.json({ nodes: filteredNodes, edges, stats: { totalNodes: filteredNodes.length, totalEdges: edges.length, queryTimeMs: 0, level, source: 'sqlite-fallback', totalEntries: getKbEntryCount(ctx.getRequestProjectId(c)) } });
  });

  return app;
}
