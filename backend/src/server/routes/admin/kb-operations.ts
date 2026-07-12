import { Hono } from 'hono';
import {
  getKbEntries,
  getKbEntryById,
  recordAudit,
  checkPromotionCooldown,
  setPromotionCooldown,
} from '../../../admin/admin-db.js';
import { containsHtml, sanitizeKbEntry } from '../../../admin/sanitize.js';
import type { AdminContext } from './context.js';

export function createKbOperationsRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/kb/entries/:id/link', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const entryId = c.req.param('id');
    const { targetId, linkType } = await c.req.json();
    if (!targetId) return c.json({ error: 'targetId is required' }, 400);
    if (!ctx.kbLinks[entryId]) ctx.kbLinks[entryId] = [];
    ctx.kbLinks[entryId].push({ targetId, linkType: linkType || 'related', createdAt: new Date().toISOString() });
    recordAudit(user.userId, user.username, 'LINK_ENTRY', 'kb', entryId, JSON.stringify({ targetId, linkType }));
    return c.json({ success: true, links: ctx.kbLinks[entryId] });
  });

  app.get('/api/admin/kb/entries/:id/links', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    return c.json({ entryId: c.req.param('id'), links: ctx.kbLinks[c.req.param('id')] || [] });
  });

  app.get('/api/admin/kb/promotions', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;
    const status = c.req.query('status') || undefined;
    let filtered = [...ctx.promotionQueue];
    if (status) filtered = filtered.filter(p => p.status === status);
    return c.json({ promotions: filtered, total: filtered.length });
  });

  app.post('/api/admin/kb/promotions', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;
    const { entryId, fromTier, toTier, reason } = await c.req.json();
    if (!entryId || !toTier) return c.json({ error: 'entryId and toTier required' }, 400);
    const cooldownStatus = checkPromotionCooldown(entryId);
    if (cooldownStatus.onCooldown) return c.json({ error: 'Entry is on promotion cooldown after a recent rejection', cooldownUntil: cooldownStatus.cooldownUntil }, 400);
    const promotion = { id: 'promo-' + Date.now().toString(36), entryId, fromTier: fromTier || 'USER', toTier, reason: reason || '', requestedBy: user.username, requestedAt: new Date().toISOString(), status: 'pending' };
    ctx.promotionQueue.push(promotion);
    recordAudit(user.userId, user.username, 'REQUEST_PROMOTION', 'kb', entryId, JSON.stringify({ fromTier, toTier }));
    return c.json({ success: true, promotion }, 201);
  });

  app.post('/api/admin/kb/promotions/:id/review', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;
    const promoId = c.req.param('id');
    const { action } = await c.req.json();
    if (!action || !['approve', 'reject'].includes(action)) return c.json({ error: 'action must be approve or reject' }, 400);
    const promo = ctx.promotionQueue.find(p => p.id === promoId);
    if (!promo) return c.json({ error: 'Promotion not found' }, 404);
    promo.status = action === 'approve' ? 'approved' : 'rejected';
    promo.reviewedBy = user.username;
    promo.reviewedAt = new Date().toISOString();
    if (action === 'reject') setPromotionCooldown(promo.entryId, user.username);
    recordAudit(user.userId, user.username, action === 'approve' ? 'APPROVE_PROMOTION' : 'REJECT_PROMOTION', 'kb', promo.entryId);
    return c.json({ success: true, promotion: promo });
  });

  app.get('/api/admin/kb/export', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_IMPORT_EXPORT');
    if (permCheck instanceof Response) return permCheck;
    const result = getKbEntries(1, 100000, 'created_at', 'desc', ctx.getRequestProjectId(c));
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    let entries = result.items;
    if (Array.isArray(allowedTiers)) entries = entries.filter((e: any) => { const t = e.tier || e.scope || 'SHARED'; return allowedTiers.includes(t); });
    recordAudit(user.userId, user.username, 'KB_EXPORT', 'kb', undefined, JSON.stringify({ count: entries.length }));
    return c.json({ entries, exportedAt: new Date().toISOString(), count: entries.length });
  });

  app.post('/api/admin/kb/import', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'KB_IMPORT_EXPORT');
    if (permCheck instanceof Response) return permCheck;
    try {
      const { entries: rawEntries, conflictMode } = await c.req.json();
      if (!Array.isArray(rawEntries)) return c.json({ error: 'entries must be an array' }, 400);
      for (const entry of rawEntries) {
        for (const field of ['source', 'content', 'summary', 'title']) {
          if (containsHtml((entry as any)?.[field])) return c.json({ error: `Entry field "${field}" contains disallowed HTML/script content` }, 400);
        }
      }
      const entries = rawEntries.map((e: any) => sanitizeKbEntry(e));
      const mode = conflictMode || 'skip';
      if (!['skip', 'overwrite', 'merge'].includes(mode)) return c.json({ error: 'conflictMode must be skip, overwrite, or merge' }, 400);
      const existingEntries = getKbEntries(1, 100000, 'created_at', 'desc', ctx.getRequestProjectId(c));
      const existingIds = new Set(existingEntries.items.map((e: any) => e.id || e.entry_id));
      const conflicts: any[] = [];
      const newEntries: any[] = [];
      for (const entry of entries) {
        const entryId = entry.id || entry.entry_id;
        if (entryId && existingIds.has(entryId)) conflicts.push({ id: entryId, existing: existingEntries.items.find((e: any) => (e.id || e.entry_id) === entryId), incoming: entry });
        else newEntries.push(entry);
      }
      let imported = newEntries.length;
      let skipped = 0, overwritten = 0, merged = 0;
      if (conflicts.length > 0) {
        switch (mode) {
          case 'skip': skipped = conflicts.length; break;
          case 'overwrite': overwritten = conflicts.length; imported += conflicts.length; break;
          case 'merge': merged = conflicts.length; imported += conflicts.length; break;
        }
      }
      recordAudit(user.userId, user.username, 'KB_IMPORT', 'kb', undefined, JSON.stringify({ count: entries.length, conflictMode: mode, imported, skipped, overwritten, merged }));
      return c.json({ success: true, imported, skipped, overwritten, merged, conflicts: conflicts.map(cf => ({ id: cf.id, existingSource: cf.existing?.source || cf.existing?.title || 'unknown', incomingSource: cf.incoming?.source || cf.incoming?.title || 'unknown' })), message: `${imported} entries imported (${skipped} skipped, ${overwritten} overwritten, ${merged} merged)` });
    } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  });

  return app;
}
