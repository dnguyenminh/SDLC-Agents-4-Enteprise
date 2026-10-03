/**
 * Unified auth — credential login and self-registration routes.
 * Split out of unified.ts (200-line standard); behavior is unchanged.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import pino from 'pino';
import { recordAudit, getUserPermissions } from '../../../admin/admin-db.js';
import { hashPassword } from '../../../admin/db/password.js';
import type { UserRepository } from '../../../database/repositories/UserRepository.js';
import type { SessionService } from '../../services/SessionService.js';

const logger = pino({ name: 'auth-login' });

const loginSchema = z.object({ identifier: z.string().optional(), username: z.string().optional(), email: z.string().optional(), password: z.string() });
// Self-registration never accepts access_group_id — group is always grp-viewer (privilege-escalation guard).
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6), username: z.string().optional() });

/** Collaborators these handlers need from the route factory. */
export interface LoginRouteDeps {
  repo: UserRepository;
  sessions: SessionService;
}

export function registerLoginRoutes(app: Hono, deps: LoginRouteDeps): void {
  const { repo, sessions } = deps;

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
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '';
      // SA4E-319: The VS Code extension shares one session token across two clients with
      // different user-agents — the extension host (Node) and the embedded webview iframe
      // (Chromium). Binding the session to a single UA (SA4E-262 session-fixation hardening)
      // would reject the iframe's requests (401) and cascade into a global logout. So for
      // extension-issued sessions we skip UA-binding (issue with an empty UA). The public
      // SSO/browser login flow sends no X-Client-Type header and keeps UA-binding ON.
      const isExtensionClient = (c.req.header('x-client-type') || '').toLowerCase() === 'extension';
      const sessionUserAgent = isExtensionClient ? '' : userAgent;
      const session = await sessions.issue(user.user_id as string, '', ip, sessionUserAgent);
      await recordAudit(user.user_id as string, user.username as string, 'LOGIN', 'auth', session.sessionId);
      const permissions = await getUserPermissions(user.user_id as string);
      const tokens = {
        token: session.token,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
        expiresIn: session.expiresIn,
      };
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
            ...tokens,
            user: { userId: user.user_id, email: user.email, accessGroupId: user.access_group_id, permissions: permissions.map(p => p.permissionId) },
          }
        });
      }
      const response = {
        ...tokens,
        user: userPayload,
        success: true,
        data: { ...tokens, user: { userId: user.user_id, email: user.email, accessGroupId: user.access_group_id, permissions: permissions.map(p => p.permissionId) } }
      };
      return c.json(response);
    } catch (err: any) {
      console.error('Login error', err);
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
      const { email, password } = parsed.data;
      const existing = await repo.findByEmail(email);
      if (existing) {
        return c.json({ success: false, error: { code: 'ERR_002', message: 'Email already registered' } }, 400);
      }
      const hash = hashPassword(password);
      const user = await repo.createUser({ email, username: email, passwordHash: hash, accessGroupId: 'grp-viewer' });
      await recordAudit(user.user_id as string, email, 'REGISTER', 'user', user.user_id as string);
      const response = {
        success: true,
        data: { userId: user.user_id, email, accessGroupId: user.access_group_id },
        user: { userId: user.user_id, email, username: email }
      };
      return c.json(response, 200);
    } catch (err: any) {
      logger.error({ err, context: 'register' }, 'Register error');
      return c.json({ success: false, error: { code: 'ERR_003', message: 'Registration failed' } }, 500);
    }
  });
}
