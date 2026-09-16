import { Hono } from 'hono';
import { z } from 'zod';
import { getDbAdapter } from '../../../admin/admin-db.js';
import { hashPassword } from '../../../admin/db/password.js';
import { recordAudit } from '../../../admin/admin-db.js';
import { UserRepository } from '../../../database/repositories/UserRepository.js';
import { SessionService } from '../../services/SessionService.js';

const loginSchema = z.object({ identifier: z.string().optional(), username: z.string().optional(), password: z.string() });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6), username: z.string().optional() });
const refreshSchema = z.object({ sessionToken: z.string().optional(), refresh_token: z.string().optional() });

export function createUnifiedAuthRoutes() {
  const app = new Hono();
  const repo = new UserRepository(getDbAdapter() as any);
  const sessions = new SessionService();

  app.post('/auth/login', async (c) => {
    const data = loginSchema.safeParse(await c.req.json());
    if (!data.success) return c.json({ error: { code: 'invalid_input' } }, 400);
    const identifier = data.data.identifier || data.data.username;
    if (!identifier) return c.json({ error: { code: 'invalid_input' } }, 400);
    const user = await repo.verifyCredentials(identifier, data.data.password);
    if (!user) return c.json({ error: { code: 'ERR-01', message: 'invalid_credentials' } }, 401);
    const session = await sessions.issue(user.user_id as string);
    await recordAudit(user.user_id as string, user.username as string, 'LOGIN', 'auth', session.sessionId);
    return c.json({ sessionToken: session.token, user: { userId: user.user_id, email: user.email, username: user.username } });
  });

  app.post('/auth/register', async (c) => {
    const data = registerSchema.safeParse(await c.req.json());
    if (!data.success) return c.json({ error: { code: 'invalid_input' } }, 400);
    const exists = await repo.findByEmail(data.data.email);
    if (exists) return c.json({ error: { code: 'ERR-03', message: 'duplicate_register' } }, 409);
    const hash = hashPassword(data.data.password);
    const user = await repo.createUser({ email: data.data.email, username: data.data.username, passwordHash: hash });
    await recordAudit(user.user_id as string, user.username as string, 'REGISTER', 'user', user.user_id as string);
    return c.json({ user: { userId: user.user_id, email: user.email, username: user.username } }, 201);
  });

  app.post('/auth/refresh', async (c) => {
    const data = refreshSchema.safeParse(await c.req.json());
    if (!data.success) return c.json({ error: { code: 'invalid_input' } }, 400 as any);
    const token = data.data.sessionToken || data.data.refresh_token;
    if (!token) return c.json({ error: { code: 'invalid_input' } }, 400);
    const res = await sessions.refresh(token);
    if (!res) return c.json({ error: { code: 'ERR-04', message: 'session_expired' } }, 401);
    return c.json({ sessionToken: res.token });
  });

  app.get('/auth/me', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    const user = await sessions.validate(token);
    if (!user) return c.json({ error: { code: 'ERR-04' } }, 401);
    const row = await repo.findById(user.userId);
    return c.json({ user: { userId: user.userId, email: row?.email, username: user.username } });
  });

  app.post('/auth/logout', async (c) => {
    const auth = c.req.header('Authorization') || '';
    const tokenFromHeader = auth.replace('Bearer ', '');
    let token = tokenFromHeader;
    if (!token) {
      try {
        const data = await c.req.json();
        token = data.sessionToken || data.refresh_token;
      } catch {}
    }
    if (token) {
      await sessions.invalidate(token);
    }
    return c.body('', 204 as any);
  });

  return app;
}
