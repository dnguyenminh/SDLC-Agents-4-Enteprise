// KSA-286: Admin Portal Module Entry Point

import { Express, Router, json } from 'express';
import path from 'path';
import { createRBACMiddleware } from './middleware/rbac.middleware.js';
import { createAuditMiddleware } from './middleware/audit.middleware.js';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { dashboardRouter } from './routes/dashboard.router.js';
import { kbAdminRouter } from './routes/kb-admin.router.js';
import { mcpAdminRouter } from './routes/mcp-admin.router.js';
import { userRouter } from './routes/user.router.js';
import { rbacRouter } from './routes/rbac.router.js';
import { configRouter } from './routes/config.router.js';
import { auditRouter } from './routes/audit.router.js';

export interface AdminModuleDependencies {
  db: any;
  jwtService: { validate(token: string): { sub: string; username: string } | null };
  kbEngine: any;
  mcpOrchestrator: any;
}

export function registerAdminModule(app: Express, deps: AdminModuleDependencies): void {
  const adminRouter = Router();
  adminRouter.use(json({ limit: '50mb' }));

  // JWT extraction
  adminRouter.use((req, _res, next) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const claims = deps.jwtService.validate(auth.slice(7));
      if (claims) { (req as { userId: string; username: string }).userId = claims.sub; (req as { userId: string; username: string }).username = claims.username; }
    }
    next();
  });

  // RBAC
  adminRouter.use(createRBACMiddleware({
    getUserPermissions: async (userId: string) => {
      const rows = deps.db.prepare(
        'SELECT gp.permission_id, gp.role_data FROM users u JOIN group_permissions gp ON gp.access_group_id = u.access_group_id WHERE u.user_id = ?'
      ).all(userId);
      return rows?.length ? rows.map((r: any) => ({ permissionId: r.permission_id, roleData: JSON.parse(r.role_data || '{}') })) : null;
    },
    getUserStatus: async (userId: string) => deps.db.prepare('SELECT status FROM users WHERE user_id = ?').get(userId)?.status || null,
  }));

  adminRouter.use(rateLimitMiddleware);
  adminRouter.use(createAuditMiddleware({
    recordAudit: async (entry) => {
      deps.db.prepare(
        'INSERT INTO audit_entries (audit_id, user_id, username, action, resource, resource_id, changes, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), entry.userId, entry.username, entry.action, entry.resource, entry.resourceId || null, entry.changes ? JSON.stringify(entry.changes) : null, entry.ipAddress || null);
    },
  }));

  // /api/admin/me
  adminRouter.get('/me', (req, res) => {
    const userId = (req as { userId: string }).userId;
    if (!userId) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }); return; }
    const user = deps.db.prepare('SELECT u.*, ag.access_group_name FROM users u JOIN access_groups ag ON ag.access_group_id = u.access_group_id WHERE u.user_id = ?').get(userId);
    if (!user) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }
    const perms = deps.db.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?').all(user.access_group_id);
    res.json({ success: true, data: { userId: user.user_id, username: user.username, email: user.email, accessGroup: { id: user.access_group_id, name: user.access_group_name }, permissions: perms.map((p: any) => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') })) } });
  });

  // Feature routers
  adminRouter.use('/dashboard', dashboardRouter(deps));
  adminRouter.use('/kb', kbAdminRouter(deps));
  adminRouter.use('/mcp', mcpAdminRouter(deps));
  adminRouter.use('/users', userRouter(deps));
  adminRouter.use('/rbac', rbacRouter(deps));
  adminRouter.use('/config', configRouter(deps));
  adminRouter.use('/audit', auditRouter(deps));

  app.use('/api/admin', adminRouter);

  // SPA static files
  const spaPath = path.join(__dirname, '../../viewer/admin');
  app.get('/admin/*', (_req, res) => { res.sendFile(path.join(spaPath, 'index.html'), (err) => { if (err) res.status(404).send('Admin Portal not built yet'); }); });

  console.log('[KSA-286] Admin Portal registered: /api/admin/* + /admin/*');
}
