/**
 * admin/routes/users.ts (facade) — User management endpoints.
 * SA4E-50: All admin-db calls are awaited; route handlers are async.
 *
 * Implementation submodules (same directory):
 * - users-profile-routes.ts  — impersonate + self-service profile
 * - users-password-routes.ts — admin reset/change password
 * - users-access-guard.ts    — access-group privilege-escalation check (SEC)
 */

import { Hono } from 'hono';
import {
  getUserById, getUsers, createUser,
  updateUserStatus, deleteUser,
  invalidateUserSessions, getUserSessions, recordAudit,
  updateUserEmail, getDbAdapter,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';
import { registerProfileRoutes } from './users-profile-routes.js';
import { registerPasswordRoutes } from './users-password-routes.js';
import { checkGroupEscalation, auditEscalationDenied } from './users-access-guard.js';

export function createUsersRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  registerProfileRoutes(app, ctx);
  registerPasswordRoutes(app, ctx);

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

      const guard = await checkGroupEscalation(user.userId, accessGroupId);
      if (!guard.ok) {
        if (guard.reason === 'group-not-found') return c.json({ error: 'Access group not found' }, 400);
        await auditEscalationDenied(user, 'CREATE_USER_DENIED', undefined, { username, accessGroupId, escalatedPermissions: guard.escalatedPermissions });
        return c.json({ error: 'Cannot assign an access group with privileges higher than your own', escalatedPermissions: guard.escalatedPermissions }, 403);
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

  app.put('/api/admin/users/:id/status', (c) => updateStatusRoute(c, ctx));
  app.put('/api/admin/users/:id', (c) => updateUserRoute(c, ctx));
  app.delete('/api/admin/users/:id', (c) => deleteUserRoute(c, ctx));

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

  return app;
}

/** PUT /api/admin/users/:id/status — enable/disable; system admin protected. */
async function updateStatusRoute(c: any, ctx: AdminContext) {
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
}

/** PUT /api/admin/users/:id — update username/email/accessGroup (escalation-guarded). */
async function updateUserRoute(c: any, ctx: AdminContext) {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
  if (permCheck instanceof Response) return permCheck;
  const targetId = c.req.param('id');
  try {
    const { username, email, accessGroupId } = await c.req.json();
    const target = await getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    if (target.username === 'admin' && username && username !== 'admin') return c.json({ error: 'Cannot rename system admin' }, 403);

    // Validate email if provided
    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // If accessGroupId provided, validate it exists and no privilege escalation
    if (accessGroupId !== undefined) {
      const guard = await checkGroupEscalation(user.userId, accessGroupId);
      if (!guard.ok) {
        if (guard.reason === 'group-not-found') return c.json({ error: 'Access group not found' }, 400);
        await auditEscalationDenied(user, 'UPDATE_USER_DENIED', targetId, { accessGroupId, escalatedPermissions: guard.escalatedPermissions });
        return c.json({ error: 'Cannot assign an access group with privileges higher than your own', escalatedPermissions: guard.escalatedPermissions }, 403);
      }
    }

    // Update user - we'll update fields that were provided
    if (username !== undefined && username !== target.username) {
      const adapter = getDbAdapter();
      await adapter.runAsync('UPDATE users SET username = ? WHERE user_id = ?', [username, targetId]);
    }
    if (email !== undefined && email !== target.email) {
      await updateUserEmail(targetId, email);
    }
    if (accessGroupId !== undefined && accessGroupId !== target.accessGroupId) {
      const adapter = getDbAdapter();
      await adapter.runAsync('UPDATE users SET access_group_id = ? WHERE user_id = ?', [accessGroupId, targetId]);
    }

    const updated = await getUserById(targetId);
    await recordAudit(user.userId, user.username, 'UPDATE_USER', 'users', targetId, JSON.stringify({ username, email, accessGroupId }));
    return c.json({ success: true, user: updated });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) return c.json({ error: 'Username already exists' }, 409);
    ctx.logger.error({ err }, 'Update user error');
    return c.json({ error: err.message || 'Internal error' }, 500);
  }
}

/** DELETE /api/admin/users/:id — delete user account. */
async function deleteUserRoute(c: any, ctx: AdminContext) {
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
}
