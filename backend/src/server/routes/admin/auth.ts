/**
 * admin/routes/auth.ts — Authentication endpoints (login, logout, refresh, me).
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import { getDbAdapter } from '../../../admin/admin-db.js';
import { recordAudit, getUserPermissions, changePassword, getUserById } from '../../../admin/admin-db.js';
import { UserRepository } from '../../../database/repositories/UserRepository.js';
import { SessionService } from '../../services/SessionService.js';
import { verifyPassword } from '../../../admin/db/password.js';
import type { AdminContext } from './context.js';

export function createAuthRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const repo = new UserRepository(getDbAdapter() as any);
  const sessions = new SessionService();

  app.post('/api/admin/auth/login', async (c) => {
    try {
      const { username, password } = await c.req.json();
      if (!username || !password) {
        return c.json({ error: 'Username and password required' }, 400);
      }
      const user = await repo.verifyCredentials(username, password);
      if (!user) {
        await recordAudit('unknown', username, 'LOGIN_FAILED', 'auth', undefined, 'User not found');
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      if (user.status !== 'ACTIVE') {
        await recordAudit(user.user_id as string, username, 'LOGIN_FAILED', 'auth', undefined, 'Account disabled');
        return c.json({ error: 'Account is disabled' }, 403);
      }
      const session = await sessions.issue(user.user_id as string);
      await recordAudit(user.user_id as string, username, 'LOGIN', 'auth', session.sessionId);
      const permissions = await getUserPermissions(user.user_id as string);
      return c.json({
        token: session.token,
        user: {
          userId: user.user_id, username: user.username, email: user.email,
          accessGroupId: user.access_group_id, forcePasswordChange: !!user.force_password_change,
          permissions: permissions.map(p => p.permissionId),
        },
        expiresAt: session.expiresAt,
      });
    } catch (err: any) {
      ctx.logger.error({ err }, 'Login error');
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  const handleLogout = async (c: any) => {
    const auth = c.req.header('Authorization') || '';
    let token = auth.replace('Bearer ', '');
    if (!token) {
      try { const body = await c.req.json(); token = body?.refresh_token || ''; }
      catch { ctx.logger.warn({ context: 'logout' }, 'Request body not JSON, skipping refresh_token extraction'); }
    }
    if (token) {
      const user = await sessions.validate(token);
      if (user) await recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      await sessions.invalidate(token);
    }
    return c.json({ success: true });
  };

  app.post('/api/admin/auth/logout', handleLogout);
  app.post('/api/auth/logout', handleLogout);

  const handleRefresh = async (c: any) => {
    try {
      const { refresh_token } = await c.req.json();
      if (!refresh_token) return c.json({ error: 'Refresh token required' }, 400);
      const result = await sessions.refresh(refresh_token);
      if (!result) return c.json({ error: 'Invalid or expired session' }, 401);
      return c.json({ token: result.token, expiresAt: result.expiresAt });
    } catch (err: any) {
      ctx.logger.error({ err }, 'Token refresh error');
      return c.json({ error: 'Internal error' }, 500);
    }
  };

  app.post('/api/admin/auth/refresh', handleRefresh);
  app.post('/api/auth/refresh', handleRefresh);

  app.post('/api/admin/auth/change-password', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) return c.json({ error: 'Current and new password required' }, 400);
    if (newPassword.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);
    const dbUser = await repo.findByUsername(user.username);
    if (!dbUser || !verifyPassword(currentPassword, dbUser.password_hash as string)) return c.json({ error: 'Current password is incorrect' }, 401);
    await changePassword(user.userId, newPassword);
    await recordAudit(user.userId, user.username, 'CHANGE_PASSWORD', 'auth');
    return c.json({ success: true });
  });

  app.get('/api/admin/auth/me', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const [permissions, dbUser] = await Promise.all([
      getUserPermissions(user.userId),
      getUserById(user.userId),
    ]);
    return c.json({
      userId: user.userId, username: user.username,
      accessGroupId: user.accessGroupId, email: dbUser?.email || '',
      forcePasswordChange: dbUser?.forcePasswordChange || false,
      permissions: permissions.map(p => p.permissionId),
    });
  });

  return app;
}
