/**
 * KB graph routes — node/edge data for graph visualization.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import { getKbEntries, getKbEntryCount } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createKbGraphRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/kb/graph', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const allowedTiers = (kbPermCheck.roleData as any)?.allowedTiers;
    const graphPermCheck = await ctx.checkPermission(user.userId, 'GRAPH_VIEW');
    const maxNodes = (graphPermCheck.roleData as any)?.maxNodes || 500;
    const result = await getKbEntries(1, 500, 'created_at', 'desc', ctx.getRequestProjectId(c));
    let nodes: any[] = [], edges: any[] = [];
    if (result.items.length > 0) {
      let items = result.items;
      if (Array.isArray(allowedTiers)) items = items.filter((e: any) => { const t = e.tier || e.scope || 'SHARED'; return allowedTiers.includes(t); });
      items = items.slice(0, maxNodes);
      nodes = items.map((e: any, i: number) => ({
        id: e.id || e.entry_id || `node-${i}`,
        label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || 'Entry ' + (i + 1),
        type: e.type || e.content_type || 'document', tier: e.tier || e.scope || 'SHARED', group: Math.floor(i / 5),
      }));
      for (let i = 0; i < nodes.length; i++) {
        const groupSize = 5;
        const groupStart = Math.floor(i / groupSize) * groupSize;
        if (i > groupStart && i < groupStart + groupSize) edges.push({ source: nodes[groupStart].id, target: nodes[i].id, weight: +(0.6 + Math.random() * 0.4).toFixed(2) });
        if (i > 0 && i % 7 === 0) {
          const target = Math.floor(Math.random() * i);
          if (nodes[i].type === nodes[target].type || nodes[i].tier === nodes[target].tier) edges.push({ source: nodes[i].id, target: nodes[target].id, weight: +(0.3 + Math.random() * 0.4).toFixed(2) });
        }
      }
    }
    if (nodes.length === 0) {
      const labels = ['project-structure', 'admin-db', 'mcp-server', 'embedding', 'config', 'routes', 'auth', 'rbac', 'audit', 'kb-index', 'tools', 'types', 'modules', 'search', 'graph'];
      let mockNodes = labels.map((label, i) => ({ id: `n${i}`, label, type: ['module', 'code', 'config', 'api', 'document'][i % 5], tier: ['SHARED', 'PROJECT', 'USER'][i % 3], group: Math.floor(i / 4) }));
      if (Array.isArray(allowedTiers)) mockNodes = mockNodes.filter(n => allowedTiers.includes(n.tier));
      mockNodes = mockNodes.slice(0, maxNodes);
      nodes = mockNodes;
      const nodeIds = new Set(nodes.map(n => n.id));
      edges = [{ source: 'n0', target: 'n1', weight: 0.9 }, { source: 'n0', target: 'n5', weight: 0.8 }, { source: 'n1', target: 'n6', weight: 0.7 }, { source: 'n2', target: 'n10', weight: 0.85 }, { source: 'n3', target: 'n9', weight: 0.6 }, { source: 'n4', target: 'n5', weight: 0.75 }, { source: 'n5', target: 'n6', weight: 0.9 }, { source: 'n6', target: 'n7', weight: 0.8 }, { source: 'n7', target: 'n8', weight: 0.7 }, { source: 'n8', target: 'n0', weight: 0.5 }, { source: 'n9', target: 'n13', weight: 0.85 }, { source: 'n10', target: 'n11', weight: 0.6 }, { source: 'n11', target: 'n12', weight: 0.7 }, { source: 'n12', target: 'n13', weight: 0.55 }, { source: 'n13', target: 'n14', weight: 0.8 }, { source: 'n14', target: 'n0', weight: 0.65 }].filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }
    const totalEntries = await getKbEntryCount(ctx.getRequestProjectId(c));
    return c.json({ nodes, edges, stats: { totalNodes: nodes.length, totalEdges: edges.length, maxNodes, totalEntries } });
  });

  app.get('/api/admin/kb/graph/cluster/:clusterId', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const clusterId = c.req.param('clusterId');
    const match = clusterId.match(/cluster-(\d+)/);
    if (!match) return c.json({ error: 'Invalid cluster ID' }, 400);
    const clusterIndex = parseInt(match[1], 10);
    const pageSize = 30;
    const offset = clusterIndex * pageSize;
    const result = await getKbEntries(1, 5000, 'created_at', 'desc', ctx.getRequestProjectId(c));
    const items = result.items.slice(offset, offset + pageSize);
    const nodes = items.map((e: any, i: number) => ({
      id: e.id || e.entry_id || `child-${offset + i}`,
      label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${offset + i + 1}`,
      type: e.type || e.content_type || 'document',
      tier: e.tier || e.scope || 'SHARED',
    }));
    const edges: any[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < Math.min(nodes.length, i + 3); j++) {
        if (nodes[i].type === nodes[j].type || nodes[i].tier === nodes[j].tier) edges.push({ source: nodes[i].id, target: nodes[j].id, weight: +(0.3 + Math.random() * 0.7).toFixed(2) });
      }
    }
    return c.json({ clusterId, nodes, edges });
  });

  app.post('/api/admin/kb/graph/sync', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    // SEC: graph sync resets the entire graph — requires RBAC_MANAGE (admin-only), not user KB_WRITE
    const permCheck = await ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const graphService = (globalThis as any).__sqliteGraphService;
    if (!graphService) return c.json({ error: 'Graph service not initialized' }, 503);
    setImmediate(async () => {
      try { await ctx.db.graph.resetGraph(); await graphService.fullSync(); }
      catch (err: any) { ctx.logger.error({ error: err.message }, 'Graph sync failed'); }
    });
    return c.json({ status: 'sync_started', message: 'Graph sync triggered in background.' });
  });

  return app;
}
