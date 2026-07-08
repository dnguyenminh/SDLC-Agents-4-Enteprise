/**
 * Middleware to reject non-localhost requests.
 * Security: Backend only serves 127.0.0.1 connections (BR-35, BR-37).
 */

import type { MiddlewareHandler } from 'hono';

export const localhostOnly: MiddlewareHandler = async (c, next) => {
  // Skip restriction if server is configured to listen on all interfaces
  const serverHost = process.env.CODE_INTEL_HOST || '127.0.0.1';
  if (serverHost === '0.0.0.0') {
    await next();
    return;
  }

  const host = c.req.header('host') || '';
  const isLocalhost = host.startsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('[::1]');

  if (!isLocalhost && host !== '') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Only localhost connections allowed. Set CODE_INTEL_HOST=0.0.0.0 to allow remote.' } },
      403
    );
  }

  await next();
};
