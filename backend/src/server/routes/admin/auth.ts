import { Hono } from 'hono';
import {
  getUserByUsername,
  verifyPassword,
  createSession,
  updateLastLogin,
  recordAudit,
  getUserPermissions,
  validateSession,
  invalidateSession,
  refreshSession,
  changePassword,
  getUserById,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createAuthRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/auth/login', async (c) => {
    try {
      const { username, password } = await c.req.json();
      if (!username || !password) {
        return c.json({ error: 'Username and password required' }, 400);
      }
      const user = getUserByUsername(username);
      if (!user) {
        recordAudit('unknown', username, 'LOGIN_FAILED', 'auth', undefined, 'User not found');
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      if (user.status !== 'ACTIVE') {
        recordAudit(user.userId, username, 'LOGIN_FAILED', 'auth', undefined, 'Account disabled');
        return c.json({ error: 'Account is disabled' }, 403);
      }
      if (!verifyPassword(password, user.passwordHash)) {
        recordAudit(user.userId, username, 'LOGIN_FAILED', 'auth', undefined, 'Wrong password');
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      const session = createSession(user.userId);
      updateLastLogin(user.userId);
      recordAudit(user.userId, username, 'LOGIN', 'auth', session.sessionId);
      const permissions = getUserPermissions(user.userId);
      return c.json({
        token: session.token,
        user: {
          userId: user.userId, username: user.username, email: user.email,
          accessGroupId: user.accessGroupId, forcePasswordChange: user.forcePasswordChange,
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
      const user = validateSession(token);
      if (user) recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      invalidateSession(token);
    }
    return c.json({ success: true });
  };

  app.post('/api/admin/auth/logout', handleLogout);
  app.post('/api/auth/logout', handleLogout);

  const handleRefresh = async (c: any) => {
    try {
      const { refresh_token } = await c.req.json();
      if (!refresh_token) return c.json({ error: 'Refresh token required' }, 400);
      const result = refreshSession(refresh_token);
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
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) return c.json({ error: 'Current and new password required' }, 400);
    if (newPassword.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);
    const dbUser = getUserByUsername(user.username);
    if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) return c.json({ error: 'Current password is incorrect' }, 401);
    changePassword(user.userId, newPassword);
    recordAudit(user.userId, user.username, 'CHANGE_PASSWORD', 'auth');
    return c.json({ success: true });
  });

  app.get('/api/admin/auth/me', (c) => {
    const user = ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permissions = getUserPermissions(user.userId);
    const dbUser = getUserById(user.userId);
    return c.json({
      userId: user.userId, username: user.username,
      accessGroupId: user.accessGroupId, email: dbUser?.email || '',
      forcePasswordChange: dbUser?.forcePasswordChange || false,
      permissions: permissions.map(p => p.permissionId),
    });
  });

  return app;
}
