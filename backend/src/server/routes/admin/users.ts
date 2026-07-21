/**
 * admin/routes/users.ts — User management endpoints.
 * SA4E-50: All admin-db calls are awaited; route handlers are async.
 */

import { Hono } from 'hono';
import {
  getUserById, getUserPermissions, getUsers, createUser,
  updateUserStatus, deleteUser, resetUserPassword,
  invalidateUserSessions, getUserSessions, recordAudit,
  getGroupById, getGroupPermissionIds,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createUsersRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

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

  app.post('/api/admin/profile', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const { email } = await c.req.json();
    if (email !== undefined) {
      ctx.db.user.updateEmail(user.userId, email);
      await recordAudit(user.userId, user.username, 'UPDATE_PROFILE', 'users', user.userId, JSON.stringify({ email }));
    }
    const dbUser = await getUserById(user.userId);
    return c.json({ success: true, user: { userId: dbUser?.userId, username: dbUser?.username, email: dbUser?.email } });
  });

  app.get('/api/admin/users', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '50');
    const status = c.req.query('status') || undefined;
    const search = c.req.query('search') || undefined;
    const accessGroupId = c.req.query('accessGroupId') || undefined;
    const result = await getUsers({ status, search, accessGroupId }, page, pageSize);
    return c.json({ users: result.items, total: result.total, page, pageSize, totalPages: Math.ceil(result.total / pageSize) });
  });

  app.get('/api/admin/users/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const [targetUser, sessions] = await Promise.all([
      getUserById(c.req.param('id')),
      getUserSessions(c.req.param('id')),
    ]);
    if (!targetUser) return c.json({ error: 'User not found' }, 404);
    return c.json({ ...targetUser, sessions });
  });

  app.post('/api/admin/users', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    try {
      const { username, email, password, accessGroupId } = await c.req.json();
      if (!username || !password || !accessGroupId) return c.json({ error: 'username, password, and accessGroupId are required' }, 400);
      if (username.length < 3) return c.json({ error: 'Username must be at least 3 characters' }, 400);
      if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);
      const [group, creatorPerms] = await Promise.all([
        getGroupById(accessGroupId),
        getUserPermissions(user.userId),
      ]);
      if (!group) return c.json({ error: 'Access group not found' }, 400);
      const creatorPermSet = new Set(creatorPerms.map(p => p.permissionId));
      const targetPerms = await getGroupPermissionIds(accessGroupId);
      const escalated = targetPerms.filter(p => !creatorPermSet.has(p));
      if (escalated.length > 0) {
        await recordAudit(user.userId, user.username, 'CREATE_USER_DENIED', 'users', undefined, JSON.stringify({ username, accessGroupId, escalatedPermissions: escalated }));
        return c.json({ error: 'Cannot assign an access group with privileges higher than your own', escalatedPermissions: escalated }, 403);
      }
      const newUser = await createUser(username, email || '', password, accessGroupId);
      await recordAudit(user.userId, user.username, 'CREATE_USER', 'users', newUser.userId, JSON.stringify({ username, accessGroupId }));
      return c.json({ success: true, user: newUser }, 201);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) return c.json({ error: 'Username already exists' }, 409);
      ctx.logger.error({ err }, 'Create user error');
      return c.json({ error: err.message || 'Internal error' }, 500);
    }
  });

  app.put('/api/admin/users/:id/status', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('id');
    const { status } = await c.req.json();
    if (!status || !['ACTIVE', 'DISABLED'].includes(status)) return c.json({ error: 'Invalid status. Must be ACTIVE or DISABLED' }, 400);
    const target = await getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    if (target.username === 'admin' && status === 'DISABLED') return c.json({ error: 'Cannot disable system admin' }, 403);
    const sessionsTerminated = await updateUserStatus(targetId, status);
    await recordAudit(user.userId, user.username, 'UPDATE_USER_STATUS', 'users', targetId, JSON.stringify({ status, sessionsTerminated }));
    return c.json({ success: true, sessionsTerminated });
  });

  app.delete('/api/admin/users/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('id');
    try {
      const target = await getUserById(targetId);
      if (!target) return c.json({ error: 'User not found' }, 404);
      await deleteUser(targetId);
      await recordAudit(user.userId, user.username, 'DELETE_USER', 'users', targetId, JSON.stringify({ username: target.username }));
      return c.json({ success: true });
    } catch (err: any) { return c.json({ error: err.message }, 400); }
  });

  app.post('/api/admin/users/:id/force-logout', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('id');
    const target = await getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    const terminated = await invalidateUserSessions(targetId);
    await recordAudit(user.userId, user.username, 'FORCE_LOGOUT', 'users', targetId, JSON.stringify({ terminated }));
    return c.json({ success: true, terminated });
  });

  app.post('/api/admin/users/:id/reset-password', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('id');
    const target = await getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    const temporaryPassword = await resetUserPassword(targetId);
    await invalidateUserSessions(targetId);
    await recordAudit(user.userId, user.username, 'RESET_PASSWORD', 'users', targetId);
    return c.json({ success: true, temporaryPassword });
  });

  return app;
}
