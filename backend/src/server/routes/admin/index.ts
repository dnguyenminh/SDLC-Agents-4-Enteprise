import { Hono } from 'hono';
import type { Logger } from 'pino';
import { getDbAdapter } from '../../../admin/admin-db.js';
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
import { createSsoProvidersRoutes } from './sso-providers.js';
import { createSa4e215Route } from '../sa4e-215/index.js';
import type { AdminContext } from './context.js';

/** GET /api/admin/projects — list registered workspaces from project_registry. */
function createProjectsRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  app.get('/api/admin/projects', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    try {
      const adapter = getDbAdapter();
      // RBAC_MANAGE (admins) see all workspaces; others only see their own
      const rbacCheck = await ctx.requirePermission(c, user.userId, 'RBAC_MANAGE');
      const isAdmin = !(rbacCheck instanceof Response);
      const rows = isAdmin
        ? await adapter.allAsync<{ project_id: string; display_name: string; workspace_path: string; last_seen: string }>(
            'SELECT project_id, display_name, workspace_path, last_seen FROM project_registry ORDER BY last_seen DESC LIMIT 100'
          )
        : await adapter.allAsync<{ project_id: string; display_name: string; workspace_path: string; last_seen: string }>(
            'SELECT project_id, display_name, workspace_path, last_seen FROM project_registry WHERE created_by = ? OR created_by = ? ORDER BY last_seen DESC LIMIT 100',
            [user.userId, user.username ?? '']
          );
      return c.json({ projects: rows });
    } catch {
      return c.json({ projects: [] });
    }
  });
  /** POST /api/admin/projects/register — register/upsert a project in project_registry. */
  app.post('/api/admin/projects/register', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    try {
      const body = await c.req.json().catch(() => ({}));
      const projectId = body.projectId as string | undefined;
      if (!projectId) return c.json({ error: 'projectId is required' }, 400);
      const adapter = getDbAdapter();
      await adapter.runAsync(
        `INSERT INTO project_registry (project_id, display_name, workspace_path, created_by, last_seen)
         VALUES (?, ?, ?, ?, current_timestamp)
         ON CONFLICT(project_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            workspace_path = EXCLUDED.workspace_path,
            last_seen = current_timestamp`,
        [projectId, body.displayName || '', body.workspacePath || '', body.createdBy || user.userId]
      );
      const row = await adapter.getAsync<{ project_id: string; display_name: string; workspace_path: string }>(
        'SELECT project_id, display_name, workspace_path FROM project_registry WHERE project_id = ?',
        [projectId]
      );
      return c.json({ success: true, project: row });
    } catch (err: any) {
      ctx.logger.error({ err }, 'Register project error');
      return c.json({ __error: true, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });
  return app;
}

export function createAdminRoute(logger: Logger, registry?: any): Hono {
  const ctx = createAdminContext(logger, registry);
  const app = new Hono();

  // Middleware: ensure project is registered for all admin routes
  app.use('*', async (c, next) => {
    const path = c.req.path;
    const method = c.req.method;
    // Skip auth routes, static routes, GET projects list, and POST register
    // Skip non-project-scoped routes: auth, users, RBAC, config, database, SSO, static, SA4E-215, projects list/register
    if (path.startsWith('/api/admin/auth') || path.startsWith('/auth')) { return next(); }
    if (path.startsWith('/api/admin/users') || path.startsWith('/api/admin/impersonate') || path.startsWith('/api/admin/profile')) { return next(); }
    if (path.startsWith('/api/admin/rbac')) { return next(); }
    if (path.startsWith('/api/admin/config') || path.startsWith('/api/admin/llm')) { return next(); }
    if (path.startsWith('/api/admin/database')) { return next(); }
    if (path.startsWith('/api/admin/sso-providers')) { return next(); }
    if (path.startsWith('/api/sa4e-215')) { return next(); }
    if (path.startsWith('/admin') || path.startsWith('/static')) { return next(); }
    if (path === '/api/admin/projects' && method === 'GET') { return next(); }
    if (path === '/api/admin/projects/register' && method === 'POST') { return next(); }
    const result = await ctx.ensureProjectRegistered(c);
    if (result instanceof Response) return result;
    if (result === '') return next(); // Empty string = skip guard (default project)
    return next();
  });

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
  app.route('/api/admin/sso-providers', createSsoProvidersRoutes(ctx));
  app.route('/api/sa4e-215', createSa4e215Route());

  logger.info('Admin portal routes registered: /admin + /api/admin/* + /api/sa4e-215/* (with auth, SSE, project-registry guard)');
  return app;
}
