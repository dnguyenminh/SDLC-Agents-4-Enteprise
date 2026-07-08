/**
 * Simple in-memory rate limiter middleware for admin API.
 * Sliding window: max 100 requests per minute per IP.
 * Lightweight — no external dependencies.
 */

import type { Context, Next } from 'hono';

interface RateLimitEntry {
  timestamps: number[];
}

const store: Map<string, RateLimitEntry> = new Map();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(ip);
  }
}, 300000).unref();

const MAX_REQUESTS = process.env.NODE_ENV === 'production' ? 100 : 10000;
const WINDOW_MS = 60000; // 1 minute

/**
 * Rate limiting middleware — 100 requests/minute per IP.
 * Applied to /api/admin/* endpoints.
 */
export async function rateLimiter(c: Context, next: Next): Promise<Response | void> {
    // Only trust proxy headers when behind a reverse proxy (configurable)
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const ip = trustProxy
    ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '127.0.0.1')
    : '127.0.0.1'; // When not behind proxy, all connections are local
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = store.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(ip, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000);
    return c.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  entry.timestamps.push(now);

  // Set rate limit headers
  c.header('X-RateLimit-Limit', String(MAX_REQUESTS));
  c.header('X-RateLimit-Remaining', String(MAX_REQUESTS - entry.timestamps.length));
  c.header('X-RateLimit-Reset', String(Math.ceil((cutoff + WINDOW_MS) / 1000)));

  await next();
}
