import { Hono } from 'hono';
import {
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  recordAudit,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createRbacRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/rbac/groups', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const groups = getGroups();
    const result = groups.map(g => ({
      ...g, id: g.accessGroupId, name: g.accessGroupName,
      isSystem: g.isSystemGroup,
      userCount: ctx.db.user.getUserCountByGroup(g.accessGroupId),
      permissions: g.permissions.map(p => ({ name: p.permissionId, roleData: p.roleData })),
    }));
    return c.json({ groups: result });
  });

  app.get('/api/admin/rbac/groups/:id', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const group = getGroupById(c.req.param('id'));
    if (!group) return c.json({ error: 'Group not found' }, 404);
    return c.json(group);
  });

  app.post('/api/admin/rbac/groups', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    try {
      const body = await c.req.json();
      const name = body.name || body.accessGroupName;
      if (!name) return c.json({ error: 'Group name required' }, 400);
      const permissions = (body.permissions || []).map((p: any) => ({
        permissionId: p.name || p.permissionId, roleData: p.roleData || {},
      }));
      const group = createGroup(name, permissions);
      recordAudit(user.userId, user.username, 'CREATE_GROUP', 'rbac', group.accessGroupId, JSON.stringify({ name }));
      return c.json({ success: true, group: { ...group, id: group.accessGroupId, name: group.accessGroupName, isSystem: false } }, 201);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) return c.json({ error: 'Group name already exists' }, 409);
      return c.json({ error: err.message || 'Internal error' }, 500);
    }
  });

  app.put('/api/admin/rbac/groups/:id', async (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    try {
      const groupId = c.req.param('id');
      const body = await c.req.json();
      const name = body.name || body.accessGroupName;
      const permissions = (body.permissions || []).map((p: any) => ({
        permissionId: p.name || p.permissionId, roleData: p.roleData || {},
      }));
      const group = updateGroup(groupId, name, permissions);
      recordAudit(user.userId, user.username, 'UPDATE_GROUP', 'rbac', groupId, JSON.stringify({ name, permCount: permissions.length }));
      return c.json({ success: true, group });
    } catch (err: any) { return c.json({ error: err.message || 'Internal error' }, 400); }
  });

  app.delete('/api/admin/rbac/groups/:id', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    try {
      const groupId = c.req.param('id');
      deleteGroup(groupId);
      recordAudit(user.userId, user.username, 'DELETE_GROUP', 'rbac', groupId);
      return c.json({ success: true });
    } catch (err: any) { return c.json({ error: err.message }, 400); }
  });

  app.get('/api/admin/rbac/permissions', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    return c.json({
      permissions: [
        'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
        'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
        'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW',
      ],
    });
  });

  return app;
}
