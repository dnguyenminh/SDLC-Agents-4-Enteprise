/**
 * Unified auth routes — shared by `/api/auth/*` and the `/api/admin/auth/*` alias.
 * SA4E-321: login/refresh issue a dual-token pair (15-min access JWT + rotating
 * refresh token). Credential login, registration and the token endpoints live in
 * login-routes.ts / token-routes.ts to keep this factory under 200 lines.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  getDbAdapter,
  recordAudit,
  getUserPermissions,
  getUserById,
  changePassword,
  invalidateUserSessions,
} from '../../../admin/admin-db.js';
import { verifyPassword } from '../../../admin/db/password.js';
import { UserRepository } from '../../../database/repositories/UserRepository.js';
import { SessionService } from '../../services/SessionService.js';
import { registerLoginRoutes } from './login-routes.js';
import { registerTokenRoutes } from './token-routes.js';

const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(6) });

export function createUnifiedAuthRoutes() {
  const app = new Hono();
  const repo = new UserRepository(getDbAdapter() as any);
  const sessions = new SessionService();

  registerLoginRoutes(app, { repo, sessions });
  registerTokenRoutes(app, sessions);

  app.post('/logout', async (c) => {
    const auth = c.req.header('Authorization') || '';
    let token = auth.replace('Bearer ', '');
    if (!token) {
      try { const body = await c.req.json(); token = body?.refresh_token || ''; } catch {}
    }
    if (token) {
      const userAgent = c.req.header('user-agent') || '';
      const user = await sessions.validate(token, userAgent);
      if (user) {
        await recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      }
      await sessions.invalidate(token);
    }
    return c.json({ success: true, message: 'Successfully logged out' });
  });

  app.get('/me', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    const userAgent = c.req.header('user-agent') || '';
    const user = await sessions.validate(token, userAgent);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const [permissions, dbUser] = await Promise.all([
      getUserPermissions(user.userId),
      getUserById(user.userId),
    ]);
    const payload = {
      userId: user.userId,
      username: user.username,
      accessGroupId: user.accessGroupId,
      email: dbUser?.email || '',
      forcePasswordChange: dbUser?.forcePasswordChange || false,
      permissions: permissions.map(p => p.permissionId),
    };
    return c.json({ success: true, data: payload, ...payload });
  });

  app.post('/change-password', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    const userAgent = c.req.header('user-agent') || '';
    const user = await sessions.validate(token, userAgent);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Current and new password required' }, 400);
    const { currentPassword, newPassword } = parsed.data;
    const dbUser = await repo.findByUsername(user.username);
    if (!dbUser || !verifyPassword(currentPassword, dbUser.password_hash as string)) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }
    await changePassword(user.userId, newPassword);
    await invalidateUserSessions(user.userId);
    await recordAudit(user.userId, user.username, 'CHANGE_PASSWORD', 'auth');
    return c.json({ success: true });
  });

  return app;
}
