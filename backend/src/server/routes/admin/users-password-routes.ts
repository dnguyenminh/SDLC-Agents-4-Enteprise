/**
 * admin/routes/users — password management endpoints (admin-initiated).
 * Extracted from users.ts: forced reset (returns temporary password) and
 * admin-set password change; both terminate existing sessions.
 */

import { Hono } from 'hono';
import {
  getUserById, resetUserPassword, changePassword, invalidateUserSessions, recordAudit,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

/** Register admin password management routes. */
export function registerPasswordRoutes(app: Hono, ctx: AdminContext): void {
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

  app.post('/api/admin/users/:id/change-password', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const targetId = c.req.param('id');
    const target = await getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    const { newPassword } = await c.req.json();
    if (!newPassword || newPassword.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);
    await changePassword(targetId, newPassword);
    await invalidateUserSessions(targetId);
    await recordAudit(user.userId, user.username, 'CHANGE_PASSWORD_ADMIN', 'users', targetId);
    return c.json({ success: true });
  });
}
