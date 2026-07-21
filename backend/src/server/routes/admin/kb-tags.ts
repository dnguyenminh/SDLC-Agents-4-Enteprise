/**
 * admin/routes/kb-tags.ts — KB tag management endpoints.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import {
  getKbEntryById, updateKbEntryTags, getAllKbTags,
  renameKbTag, deleteKbTag, mergeKbTags, getKbEntriesByTag, recordAudit,
} from '../../../admin/admin-db.js';
import { findInvalidTag } from '../../../admin/sanitize.js';
import type { AdminContext } from './context.js';

export function createKbTagsRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/kb/entries/:id/tags', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const entryId = c.req.param('id');
    const { tags } = await c.req.json();
    if (!Array.isArray(tags)) return c.json({ error: 'tags must be an array' }, 400);
    const badTag = findInvalidTag(tags);
    if (badTag !== null) return c.json({ error: 'Invalid tag. Tags may only contain letters, numbers, spaces, hyphens, and underscores (max 64 chars).', invalidTag: badTag }, 400);
    ctx.kbTags[entryId] = tags;
    await updateKbEntryTags(entryId, tags);
    await recordAudit(user.userId, user.username, 'TAG_ENTRY', 'kb', entryId, JSON.stringify({ tags }));
    return c.json({ success: true, entryId, tags: ctx.kbTags[entryId] });
  });

  app.get('/api/admin/kb/entries/:id/tags', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const entryId = c.req.param('id');
    let tags = ctx.kbTags[entryId] || [];
    if (tags.length === 0) {
      const entry = await getKbEntryById(entryId);
      if (entry && entry.tags) {
        tags = entry.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        ctx.kbTags[entryId] = tags;
      }
    }
    return c.json({ entryId, tags });
  });

  app.get('/api/admin/kb/tags', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const tagCounts = await getAllKbTags(ctx.getRequestProjectId(c));
    if (ctx.kbTags['__tag_registry__']) {
      for (const tag of ctx.kbTags['__tag_registry__']) {
        if (!tagCounts[tag]) tagCounts[tag] = { count: 0, lastUsed: new Date().toISOString() };
      }
    }
    const tagList = Object.entries(tagCounts).map(([name, data]) => ({ name, entryCount: (data as any).count, lastUsed: (data as any).lastUsed })).sort((a, b) => b.entryCount - a.entryCount);
    return c.json({ tags: tagList, total: tagList.length });
  });

  app.post('/api/admin/kb/tags', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const { name } = await c.req.json();
    if (!name || typeof name !== 'string' || name.trim().length === 0) return c.json({ error: 'Tag name is required' }, 400);
    if (!ctx.kbTags['__tag_registry__']) ctx.kbTags['__tag_registry__'] = [];
    if (ctx.kbTags['__tag_registry__'].includes(name.trim())) return c.json({ error: 'Tag already exists' }, 409);
    ctx.kbTags['__tag_registry__'].push(name.trim());
    await recordAudit(user.userId, user.username, 'CREATE_TAG', 'kb', undefined, JSON.stringify({ tag: name.trim() }));
    return c.json({ success: true, tag: { name: name.trim(), entryCount: 0 } }, 201);
  });

  app.put('/api/admin/kb/tags/:name', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const oldName = decodeURIComponent(c.req.param('name'));
    const { name: newName } = await c.req.json();
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) return c.json({ error: 'New tag name is required' }, 400);
    let renamed = 0;
    for (const [, tags] of Object.entries(ctx.kbTags)) {
      const idx = tags.indexOf(oldName);
      if (idx !== -1) { tags[idx] = newName.trim(); renamed++; }
    }
    const dbRenamed = await renameKbTag(oldName, newName.trim());
    await recordAudit(user.userId, user.username, 'RENAME_TAG', 'kb', undefined, JSON.stringify({ oldName, newName: newName.trim(), entriesAffected: renamed + dbRenamed }));
    return c.json({ success: true, oldName, newName: newName.trim(), entriesAffected: renamed + dbRenamed });
  });

  app.delete('/api/admin/kb/tags/:name', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const tagName = decodeURIComponent(c.req.param('name'));
    let removed = 0;
    for (const [, tags] of Object.entries(ctx.kbTags)) {
      const idx = tags.indexOf(tagName);
      if (idx !== -1) { tags.splice(idx, 1); removed++; }
    }
    const dbRemoved = await deleteKbTag(tagName);
    await recordAudit(user.userId, user.username, 'DELETE_TAG', 'kb', undefined, JSON.stringify({ tag: tagName, entriesAffected: removed + dbRemoved }));
    return c.json({ success: true, tag: tagName, entriesAffected: removed + dbRemoved });
  });

  app.post('/api/admin/kb/tags/merge', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;
    const { sourceTag, targetTag } = await c.req.json();
    if (!sourceTag || !targetTag) return c.json({ error: 'sourceTag and targetTag are required' }, 400);
    if (sourceTag === targetTag) return c.json({ error: 'sourceTag and targetTag must be different' }, 400);
    let merged = 0;
    for (const [, tags] of Object.entries(ctx.kbTags)) {
      const idx = tags.indexOf(sourceTag);
      if (idx !== -1) { tags.splice(idx, 1); if (!tags.includes(targetTag)) tags.push(targetTag); merged++; }
    }
    const dbMerged = await mergeKbTags(sourceTag, targetTag);
    await recordAudit(user.userId, user.username, 'MERGE_TAGS', 'kb', undefined, JSON.stringify({ sourceTag, targetTag, entriesAffected: merged + dbMerged }));
    return c.json({ success: true, sourceTag, targetTag, entriesAffected: merged + dbMerged });
  });

  app.get('/api/admin/kb/tags/:name/entries', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    const tagName = decodeURIComponent(c.req.param('name'));
    const memEntryIds = Object.entries(ctx.kbTags).filter(([id, tags]) => id !== '__tag_registry__' && tags.includes(tagName)).map(([entryId]) => entryId);
    const memEntries = (await Promise.all(memEntryIds.map(async id => {
      const entry = await getKbEntryById(id);
      if (!entry) return null;
      return { id: entry.id || entry.entry_id || id, source: entry.source || entry.title || 'Untitled', tier: entry.tier || entry.scope || 'SHARED', type: entry.content_type || entry.type || 'document', createdAt: entry.created_at || null };
    }))).filter(Boolean);
    const dbRows = await getKbEntriesByTag(tagName, ctx.getRequestProjectId(c));
    const dbEntries = dbRows.map((entry: any) => ({ id: entry.id || entry.entry_id, source: entry.source || entry.title || 'Untitled', tier: entry.tier || entry.scope || 'SHARED', type: entry.content_type || entry.type || 'document', createdAt: entry.created_at || null }));
    const allEntries = [...memEntries, ...dbEntries];
    const uniqueMap = new Map();
    allEntries.forEach((e: any) => { if (e && !uniqueMap.has(e.id)) uniqueMap.set(e.id, e); });
    let entries = Array.from(uniqueMap.values());
    if (Array.isArray(allowedTiers)) entries = entries.filter((e: any) => allowedTiers.includes(e.tier));
    return c.json({ tag: tagName, entries, total: entries.length });
  });

  return app;
}
