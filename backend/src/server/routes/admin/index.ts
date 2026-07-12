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

  logger.info('Admin portal routes registered: /admin + /api/admin/* (with auth, SSE)');
  return app;
}
