/**
 * SA4E-217 — Rate Limit Configuration API.
 * POST /api/v1/rate-limit/config — configure rate limit maxRPM/hardCap via web admin UI.
 * Persists to DB, broadcasts RATE_LIMIT_CONFIG_CHANGED via EventBus for runtime reload.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { bus } from '../../shared/EventBus.js';
import { Events } from '../../shared/EventBus.js';
import type { Logger } from 'pino';

interface RateLimitConfigInput {
  maxRPM: number;
  hardCap?: number;
}

interface RateLimitConfigOutput {
  success: boolean;
  maxRPM: number;
  hardCap: number;
  broadcastSent: boolean;
}

/**
 * Create rate limit config routes.
 * @param logger Pino logger instance
 * @returns Hono app with rate limit config routes
 */
export function createRateLimitConfigRoutes(logger: Logger): Hono {
  const app = new Hono();

  // Apply JWT auth only — this is an admin endpoint, rate limiting handled at server level
  app.use('/rate-limit/config', jwtAuth);

  app.post('/rate-limit/config', async (c) => {
    try {
      const body = await c.req.json<RateLimitConfigInput>();

      // Validate input
      if (typeof body.maxRPM !== 'number' || body.maxRPM < 1) {
        return c.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'maxRPM must be ≥ 1' } },
          400,
        );
      }

      const hardCap = typeof body.hardCap === 'number' && body.hardCap >= 1 ? body.hardCap : 100;

      // Persist to DB using the config service pattern
      const { getDbAdapter } = await import('../../admin/db/core.js');
      const adapter = getDbAdapter();

      // Use workspaceId from JWT token payload (wid claim) or fallback
      const authHeader = c.req.header('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const payload: any = token.split('.').length === 3 ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) : {};
      const workspaceId = payload.wid || 'default';

      // Upsert rate-limit config for this workspace
      await adapter.run(
        `INSERT INTO config_entries (section, key, value, type, requires_restart, workspace_id)
         VALUES ('rateLimit', 'maxRpm', ?, 'json', 0, ?)
         ON CONFLICT(section, key) DO UPDATE SET
         value = excluded.value,
         last_modified = current_timestamp,
         modified_by = NULL,
         workspace_id = excluded.workspace_id`,
        [JSON.stringify({ maxRPM: body.maxRPM, hardCap }), workspaceId],
      );

      await adapter.run(
        `INSERT INTO config_entries (section, key, value, type, requires_restart, workspace_id)
         VALUES ('rateLimit', 'hardCap', ?, 'json', 0, ?)
         ON CONFLICT(section, key) DO UPDATE SET
         value = excluded.value,
         last_modified = current_timestamp,
         modified_by = NULL,
         workspace_id = excluded.workspace_id`,
        [JSON.stringify({ hardCap }), workspaceId],
      );

      // Broadcast RATE_LIMIT_CONFIG_CHANGED via EventBus for runtime reload
      bus.emit(Events.RATE_LIMIT_CONFIG_CHANGED, {
        section: 'rateLimit',
        key: 'maxRpm',
        value: body.maxRPM,
      });

      const output: RateLimitConfigOutput = {
        success: true,
        maxRPM: body.maxRPM,
        hardCap,
        broadcastSent: true,
      };

      logger.info({ maxRPM: body.maxRPM, hardCap, workspaceId }, '[RateLimitConfig] Config persisted and event broadcast');

      return c.json(output, 200);
    } catch (err: any) {
      logger.error({ err }, '[RateLimitConfig] Failed to persist config');
      return c.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
        500,
      );
    }
  });

  return app;
}