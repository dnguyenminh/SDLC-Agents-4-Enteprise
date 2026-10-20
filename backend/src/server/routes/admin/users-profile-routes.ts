/**
 * admin/routes/users — profile + impersonation endpoints.
 * Extracted from users.ts: self-service profile read/update and the
 * impersonation preview (RBAC_MANAGE-gated).
 */

import { Hono } from 'hono';
import {
  getUserById, getUserPermissions, recordAudit,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

/** Register profile + impersonation routes. */
export function registerProfileRoutes(app: Hono, ctx: AdminContext): void {
  registerImpersonateRoute(app, ctx);
  registerGetProfileRoute(app, ctx);
  registerUpdateProfileRoute(app, ctx);
}

/** GET /api/admin/impersonate/:userId — preview another user's effective permissions. */
function registerImpersonateRoute(app: Hono, ctx: AdminContext): void {
  app.get('/api/admin/impersonate/:userId', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('userId');
    const [target, targetPerms] = await Promise.all([
      getUserById(targetId),
      getUserPermissions(targetId),
    ]);
    if (!target) return c.json({ error: 'User not found' }, 404);
    return c.json({
      userId: target.userId, username: target.username,
      accessGroupId: target.accessGroupId,
      permissions: targetPerms.map(p => p.permissionId),
      roleData: targetPerms.reduce((acc, p) => { acc[p.permissionId] = p.roleData; return acc; }, {} as any),
    });
  });
}

/** GET /api/admin/profile — own profile; other IDs require USER_MANAGE (IDOR guard). */
function registerGetProfileRoute(app: Hono, ctx: AdminContext): void {
  app.get('/api/admin/profile', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const requestedId = c.req.query('userId');
    let targetId = user.userId;
    if (requestedId && requestedId !== user.userId) {
      const { has } = await ctx.checkPermission(user.userId, 'USER_MANAGE');
      if (!has) {
        await recordAudit(user.userId, user.username, 'PROFILE_ACCESS_DENIED', 'users', requestedId, 'IDOR attempt');
        return c.json({ error: 'Forbidden: cannot access another user profile' }, 403);
      }
      targetId = requestedId;
    }
    const [dbUser, permissions] = await Promise.all([
      getUserById(targetId),
      getUserPermissions(targetId),
    ]);
    if (!dbUser) return c.json({ error: 'User not found' }, 404);
    return c.json({
      userId: dbUser.userId, username: dbUser.username, email: dbUser.email || '',
      group: dbUser.accessGroupId, permissions: permissions.map(p => p.permissionId),
      lastLogin: dbUser.lastLogin || new Date().toISOString(),
      forcePasswordChange: dbUser.forcePasswordChange || false,
    });
  });
}

/** POST /api/admin/profile — update own email. */
function registerUpdateProfileRoute(app: Hono, ctx: AdminContext): void {
  app.post('/api/admin/profile', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const { email } = await c.req.json();
    if (email !== undefined) {
      await ctx.db.user.updateEmail(user.userId, email);
      await recordAudit(user.userId, user.username, 'UPDATE_PROFILE', 'users', user.userId, JSON.stringify({ email }));
    }
    const dbUser = await getUserById(user.userId);
    return c.json({ success: true, user: { userId: dbUser?.userId, username: dbUser?.username, email: dbUser?.email } });
  });
}
