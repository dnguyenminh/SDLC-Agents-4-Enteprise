import { Hono } from 'hono';
import type { Logger } from 'pino';
import { getAdminDb } from '../../../admin/admin-db.js';
import { createAdminContext } from './context.js';
import { createStaticRoutes } from './static.js';
import { createAuthRoutes } from './auth.js';
import { createUsersRoutes } from './users.js';
import { createRbacRoutes } from './rbac.js';
import { createMcpRoutes } from './mcp.js';
import { createConfigRoutes } from './config.js';
import { createKbEntriesRoutes } from './kb-entries.js';
import { createKbGraphRoutes } from './kb-graph.js';
import { createKbGraphSpatialRoutes } from './kb-graph-spatial.js';
import { createKbTagsRoutes } from './kb-tags.js';
import { createKbOperationsRoutes } from './kb-operations.js';
import { createKbQualityRoutes } from './kb-quality.js';
import { createAnalyticsRoutes } from './analytics.js';
import { createSseRoutes } from './sse.js';
import { createMcpCrudRoutes } from './mcp-crud.js';
import { createDatabaseRoutes } from './database.js';
import type { AdminContext } from './context.js';

/** GET /api/admin/projects — list registered workspaces from project_registry. */
function createProjectsRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  app.get('/api/admin/projects', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    try {
      const db = getAdminDb();
      const rows = db.prepare(
        'SELECT project_id, display_name, workspace_path, last_seen FROM project_registry ORDER BY last_seen DESC LIMIT 100'
      ).all() as { project_id: string; display_name: string; workspace_path: string; last_seen: string }[];
      return c.json({ projects: rows });
    } catch {
      return c.json({ projects: [] });
    }
  });
  return app;
}

export function createAdminRoute(logger: Logger, registry?: any): Hono {
  const ctx = createAdminContext(logger, registry);
  getAdminDb();

  const app = new Hono();

  app.route('/', createStaticRoutes(ctx));
  app.route('/', createAuthRoutes(ctx));
  app.route('/', createUsersRoutes(ctx));
  app.route('/', createRbacRoutes(ctx));
  app.route('/', createMcpRoutes(ctx));
  app.route('/', createMcpCrudRoutes(ctx));
  app.route('/', createConfigRoutes(ctx));
  app.route('/', createKbEntriesRoutes(ctx));
  app.route('/', createKbGraphRoutes(ctx));
  app.route('/', createKbGraphSpatialRoutes(ctx));
  app.route('/', createKbTagsRoutes(ctx));
  app.route('/', createKbOperationsRoutes(ctx));
  app.route('/', createKbQualityRoutes(ctx));
  app.route('/', createAnalyticsRoutes(ctx));
  app.route('/', createSseRoutes(ctx));
  app.route('/', createDatabaseRoutes(ctx));
  app.route('/', createProjectsRoutes(ctx));

  logger.info('Admin portal routes registered: /admin + /api/admin/* (with auth, SSE)');
  return app;
}
