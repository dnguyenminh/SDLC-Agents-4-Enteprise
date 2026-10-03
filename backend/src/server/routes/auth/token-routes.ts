/**
 * Unified auth — token endpoints: refresh rotation and one-time `sso_code`
 * exchange. Split out of unified.ts (200-line standard).
 *
 * The exchange route is public by design: the single-use, 60-second code is
 * the proof, so no credential ever travels in a URL.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import pino from 'pino';
import { consumeAuthCode } from './one-time-codes.js';
import type { SessionService } from '../../services/SessionService.js';

const logger = pino({ name: 'auth-tokens' });

const refreshSchema = z.object({ sessionToken: z.string().optional(), refresh_token: z.string().optional() });
const exchangeSchema = z.object({ code: z.string().min(10).max(200) });

export function registerTokenRoutes(app: Hono, sessions: SessionService): void {
  app.post('/refresh', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = refreshSchema.safeParse(body);
      if (!parsed.success) return c.json({ error: 'Refresh token required' }, 400);
      const token = parsed.data.sessionToken || parsed.data.refresh_token;
      if (!token) return c.json({ error: 'Refresh token required' }, 400);
      const userAgent = c.req.header('user-agent') || '';
      const result = await sessions.refresh(token, userAgent);
      if (!result) return c.json({ error: 'Invalid or expired session' }, 401);
      return c.json({
        ...result,
        success: true,
        data: { token: result.token, accessToken: result.accessToken, refreshToken: result.refreshToken },
      });
    } catch (e) {
      console.error('Refresh error', e);
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  app.post('/exchange', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = exchangeSchema.safeParse(body);
      if (!parsed.success) return c.json({ error: 'Authorization code required' }, 400);
      const payload = consumeAuthCode(parsed.data.code) as {
        token?: string; accessToken?: string; refreshToken?: string;
        expiresAt?: string; refreshExpiresAt?: string; expiresIn?: number;
      } | null;
      if (!payload?.token) return c.json({ error: 'Invalid or expired authorization code' }, 401);
      return c.json({
        ...payload,
        success: true,
        data: { token: payload.token, accessToken: payload.accessToken, refreshToken: payload.refreshToken },
      });
    } catch (e) {
      logger.error({ err: e, context: 'exchange' }, 'Auth code exchange failed');
      return c.json({ error: 'Internal error' }, 500);
    }
  });
}
