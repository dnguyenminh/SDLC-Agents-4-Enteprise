import { Hono } from 'hono';
import { z } from 'zod';
import * as crypto from 'crypto';
import { getDbAdapter } from '../../../admin/admin-db.js';
import { hashPassword, verifyPassword } from '../../../admin/db/password.js';
import { recordAudit, getUserPermissions, getUserById, changePassword } from '../../../admin/admin-db.js';
import { UserRepository } from '../../../database/repositories/UserRepository.js';
import { SessionService } from '../../services/SessionService.js';

const loginSchema = z.object({ identifier: z.string().optional(), username: z.string().optional(), email: z.string().optional(), password: z.string() });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6), username: z.string().optional(), access_group_id: z.string().optional() });
const refreshSchema = z.object({ sessionToken: z.string().optional(), refresh_token: z.string().optional() });
const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(6) });

export function createUnifiedAuthRoutes() {
  const app = new Hono();
  const repo = new UserRepository(getDbAdapter() as any);
  const sessions = new SessionService();

  app.post('/login', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = loginSchema.safeParse(body);
      const isSa4e215 = !!body.email;
      if (!parsed.success) {
        if (isSa4e215) return c.json({ success: false, error: { code: 'ERR_001', message: 'Email and password are required' } }, 400);
        return c.json({ error: 'Username and password required' }, 400);
      }
      const identifier = parsed.data.identifier || parsed.data.username || parsed.data.email;
      const password = parsed.data.password;
      if (!identifier || !password) {
        if (isSa4e215) return c.json({ success: false, error: { code: 'ERR_001', message: 'Email and password are required' } }, 400);
        return c.json({ error: 'Username and password required' }, 400);
      }
      const user = await repo.verifyCredentials(identifier, password);
      if (!user) {
        await recordAudit('unknown', identifier, 'LOGIN_FAILED', 'auth', undefined, 'User not found');
        if (isSa4e215) return c.json({ success: false, error: { code: 'ERR_002', message: 'Invalid email or password' } }, 401);
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      if (user.status !== 'ACTIVE') {
        await recordAudit(user.user_id as string, user.username as string, 'LOGIN_FAILED', 'auth', undefined, 'Account disabled');
        if (isSa4e215) return c.json({ success: false, error: { code: 'ERR_002', message: 'Account disabled' } }, 403);
        return c.json({ error: 'Account is disabled' }, 403);
      }
      const userAgent = c.req.header('user-agent') || '';
      const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '';
      const session = await sessions.issue(user.user_id as string, '', ip, userAgentHash);
      await recordAudit(user.user_id as string, user.username as string, 'LOGIN', 'auth', session.sessionId);
      const permissions = await getUserPermissions(user.user_id as string);
      const userPayload = {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        accessGroupId: user.access_group_id,
        forcePasswordChange: !!user.force_password_change,
        permissions: permissions.map(p => p.permissionId),
      };
      if (isSa4e215) {
        return c.json({
          success: true,
          data: {
            token: session.token,
            user: { userId: user.user_id, email: user.email, accessGroupId: user.access_group_id, permissions: permissions.map(p => p.permissionId) },
            expiresAt: session.expiresAt
          }
        });
      }
      const response = {
        token: session.token,
        user: userPayload,
        expiresAt: session.expiresAt,
        success: true,
        data: { token: session.token, user: { userId: user.user_id, email: user.email, accessGroupId: user.access_group_id, permissions: permissions.map(p => p.permissionId) }, expiresAt: session.expiresAt }
      };
      return c.json(response);
    } catch (err: any) {
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  app.post('/register', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: { code: 'ERR_001', message: 'Email and password are required' } }, 400);
      }
      const { email, password, access_group_id } = parsed.data;
      const existing = await repo.findByEmail(email);
      if (existing) {
        return c.json({ success: false, error: { code: 'ERR_001', message: 'Email already registered' } }, 400);
      }
      const hash = hashPassword(password);
      const user = await repo.createUser({ email, username: email, passwordHash: hash });
      await recordAudit(user.user_id as string, email, 'REGISTER', 'user', user.user_id as string);
      const response = {
        success: true,
        data: { userId: user.user_id, email, accessGroupId: access_group_id || 'grp-dev' },
        user: { userId: user.user_id, email, username: email }
      };
      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ success: false, error: { code: 'ERR_001', message: 'Registration failed' } }, 500);
    }
  });

  app.post('/logout', async (c) => {
    const auth = c.req.header('Authorization') || '';
    let token = auth.replace('Bearer ', '');
    if (!token) {
      try { const body = await c.req.json(); token = body?.refresh_token || ''; } catch {}
    }
    if (token) {
      const userAgent = c.req.header('user-agent') || '';
      const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
      const user = await sessions.validate(token, uaHash);
      if (user) await recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      await sessions.invalidate(token);
    }
    return c.json({ success: true, message: 'Successfully logged out' });
  });

  app.post('/refresh', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = refreshSchema.safeParse(body);
      if (!parsed.success) return c.json({ error: 'Refresh token required' }, 400);
      const token = parsed.data.sessionToken || parsed.data.refresh_token;
      if (!token) return c.json({ error: 'Refresh token required' }, 400);
      const userAgent = c.req.header('user-agent') || '';
      const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
      const result = await sessions.refresh(token, uaHash);
      if (!result) return c.json({ error: 'Invalid or expired session' }, 401);
      return c.json({ token: result.token, expiresAt: result.expiresAt, success: true, data: { token: result.token } });
    } catch {
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  app.get('/me', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    const userAgent = c.req.header('user-agent') || '';
    const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
    const user = await sessions.validate(token, uaHash);
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
    const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
    const user = await sessions.validate(token, uaHash);
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
    await recordAudit(user.userId, user.username, 'CHANGE_PASSWORD', 'auth');
    return c.json({ success: true });
  });

  return app;
}
