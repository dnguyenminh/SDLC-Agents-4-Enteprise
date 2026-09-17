/**
 * admin/routes/auth.ts — Authentication endpoints (login, logout, refresh, me).
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import { createUnifiedAuthRoutes } from '../auth/unified.js';
import type { AdminContext } from './context.js';

export function createAuthRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const unified = createUnifiedAuthRoutes();

  // Mount unified routes under admin auth base paths
  app.route('/api/admin/auth', unified);
  // Aliases for logout/refresh at /api/auth/*
  app.route('/api/auth', unified);

  return app;
}
