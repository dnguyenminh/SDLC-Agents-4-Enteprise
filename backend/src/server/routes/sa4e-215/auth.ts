/**
 * SA4E-215 — Authentication routes (aligned to real sa4e_db).
 *
 * Uses platform primitives (NOT Prisma/argon2):
 *  - getDbAdapter()        : unified async DatabaseAdapter (SQLite/PostgreSQL)
 *  - hashPassword/verifyPassword : PBKDF2 salt:hash (sha512)
 *  - createSession/validateSession/invalidateSession : session tokens
 *  - recordAudit           : writes to real audit_log table
 *  - getUserPermissions    : group-based RBAC
 *
 * Mounted at /api/sa4e-215/auth (via sa4e-215/index.ts).
 */
import { Hono } from 'hono';
import pino from 'pino';
import { getDbAdapter, recordAudit, getUserPermissions } from '../../../admin/admin-db.js';
import { UserRepository } from '../../../database/repositories/UserRepository.js';
import { SessionService } from '../../services/SessionService.js';
import { hashPassword } from '../../../admin/db/password.js';

const logger = pino({ name: 'sa4e-215-auth' });

export function createSa4e215AuthRoutes(): Hono {
  const repo = new UserRepository(getDbAdapter() as any);
  const sessions = new SessionService();
  const app = new Hono();

  // POST /api/sa4e-215/auth/register
  app.post('/register', async (c) => {
    try {
      const { email, password, access_group_id } = await c.req.json();
      if (!email || !password) {
        return c.json({ success: false, error: { code: 'ERR_001', message: 'Email and password are required' } }, 400);
      }
      const existing = await repo.findByEmail(email);
      if (existing) {
        return c.json({ success: false, error: { code: 'ERR_001', message: 'Email already registered' } }, 400);
      }
      const hash = hashPassword(password);
      const user = await repo.createUser({ email, username: email, passwordHash: hash });
      await recordAudit(user.user_id as string, email, 'REGISTER', 'user', user.user_id as string);
      return c.json({ success: true, data: { userId: user.user_id, email, accessGroupId: access_group_id || 'grp-dev' } });
    } catch (err: any) {
      logger.error({ err }, 'register error');
      return c.json({ success: false, error: { code: 'ERR_001', message: 'Registration failed' } }, 500);
    }
  });

  // POST /api/sa4e-215/auth/login
  app.post('/login', async (c) => {
    try {
      const { email, password } = await c.req.json();
      if (!email || !password) {
        return c.json({ success: false, error: { code: 'ERR_001', message: 'Email and password are required' } }, 400);
      }
      const user = await repo.verifyCredentials(email, password);
      if (!user) {
        await recordAudit('unknown', email, 'LOGIN_FAILED', 'auth');
        return c.json({ success: false, error: { code: 'ERR_002', message: 'Invalid email or password' } }, 401);
      }
      if (user.status !== 'ACTIVE') {
        return c.json({ success: false, error: { code: 'ERR_002', message: 'Account disabled' } }, 403);
      }
      const session = await sessions.issue(user.user_id as string);
      await recordAudit(user.user_id as string, user.username as string, 'LOGIN', 'auth', session.sessionId);
      const perms = await getUserPermissions(user.user_id as string);
      return c.json({
        success: true,
        data: {
          token: session.token,
          user: {
            userId: user.user_id,
            email: user.email,
            accessGroupId: user.access_group_id,
            permissions: perms.map((p: any) => p.permissionId),
          },
          expiresAt: session.expiresAt,
        },
      });
    } catch (err: any) {
      logger.error({ err }, 'login error');
      return c.json({ success: false, error: { code: 'ERR_002', message: 'Login failed' } }, 500);
    }
  });

  // POST /api/sa4e-215/auth/logout
  app.post('/logout', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) {
      const user = await sessions.validate(token);
      if (user) await recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      await sessions.invalidate(token);
    }
    return c.json({ success: true, message: 'Successfully logged out' });
  });

  return app;
}
