/**
 * API key authentication middleware.
 * Protects public API endpoints when CODE_INTEL_API_KEY env var is set.
 *
 * Behavior:
 * - If CODE_INTEL_API_KEY is NOT set → no auth required (backward compat for local dev)
 * - If CODE_INTEL_API_KEY IS set → require Bearer token or X-API-Key header
 *
 * Accepts:
 * - Authorization: Bearer {key}
 * - X-API-Key: {key}
 *
 * Security: Finding #3 (Missing Authentication on Public API Endpoints)
 */

import type { MiddlewareHandler, Context } from 'hono';
import { timingSafeEqual } from 'crypto';

const API_KEY = process.env.CODE_INTEL_API_KEY || '';

/** Whether API key auth is active (env var is set and non-empty). */
export function isApiKeyAuthEnabled(): boolean {
  return API_KEY.length > 0;
}

/** Extract API key from request headers. */
function extractKey(c: Context): string | null {
  const bearer = c.req.header('Authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7);
  }
  return c.req.header('X-API-Key') || null;
}

/** Timing-safe comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Middleware that enforces API key auth on protected routes.
 * No-op when CODE_INTEL_API_KEY is not configured.
 */
export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  if (!isApiKeyAuthEnabled()) {
    await next();
    return;
  }

  const provided = extractKey(c);
  if (!provided) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'API key required. Set Authorization: Bearer {key} or X-API-Key header.' } },
      401
    );
  }

  if (!safeCompare(provided, API_KEY)) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' } },
      401
    );
  }

  await next();
};
