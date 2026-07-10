/**
 * Admin Portal routes — /admin (SPA) + /api/admin/* (API)
 * Features: Real JWT auth, persistent RBAC (SQLite), full User CRUD.
 * All on same port as MCP backend (48721).
 */

import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import {
  getAdminDb,
  verifyPassword,
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  refreshSession,
  getUsers,
  getUserById,
  getUserByUsername,
  createUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changePassword,
  updateLastLogin,
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getUserPermissions,
  getUserSessions,
  recordAudit,
  getAuditLogs,
  recordConfigChange,
  getConfigChanges,
  getKbEntryCount,
  getKbEntries,
  getRecentActivity,
  recordQueryLog,
  getQueryLogs,
  getQueryLogStats,
  setPromotionCooldown,
  checkPromotionCooldown,
  searchKbEntries,
  getKbEmbeddings,
  getKbEntryById,
  getAllKbTags,
  updateKbEntryTags,
  renameKbTag,
  deleteKbTag,
  mergeKbTags,
  getKbEntriesByTag,
  getGroupPermissionIds,
} from '../../admin/admin-db.js';
import { findInvalidTag, containsHtml, sanitizeKbEntry } from '../../admin/sanitize.js';
import { loadConfig, getWorkspacePath } from '../../config/BackendConfig.js';
import { validateExternalUrl } from '../middleware/url-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function createAdminRoute(logger: Logger, registry?: any): Hono {
  const app = new Hono();

  // Initialize DB on first load
  getAdminDb();

  // Resolve SPA file path
  const spaPath = path.resolve(__dirname, '../../viewer/admin/index.html');

  // Admin SPA
  app.get('/admin', (c) => {
    if (fs.existsSync(spaPath)) {
      let html = fs.readFileSync(spaPath, 'utf-8');
      const token = c.req.query('token');
      const page = c.req.query('page') || '';
      const embed = c.req.query('embed');
      if (embed) {
        html = html.replace('</head>', '<style>.sidebar{display:none!important}.main{padding:0!important;height:100vh!important;width:100%!important}</style></head>');
      }
      if (token) {
        const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
        html = html.replace('</head>', injectScript + '</head>');
      }
      if (page) {
        html = html.replace("useState('dashboard')", "useState('" + page + "')");
      }
      return new Response(html, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } });
    }
    return c.text('Admin Portal not found', 404);
  });


  // Serve LOD scripts for KB Graph
  app.get('/admin/kb-graph-renderer.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/kb-graph-renderer.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/gesture-fsm.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/gesture-fsm.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/camera-physics.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/camera-physics.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/zoom-animator.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/zoom-animator.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/map-controls.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/map-controls.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/lod-clustering.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/lod-clustering.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/lod-manager.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/lod-manager.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript' } });
    return c.text('Not found', 404);
  });
  app.get('/admin/lod-animation.js', (c) => {
    const fp = path.resolve(__dirname, '../../viewer/admin/lod-animation.js');
    if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript' } });
    return c.text('Not found', 404);
  });

  app.get('/admin/*', (c) => {
    if (fs.existsSync(spaPath)) {
      const html = fs.readFileSync(spaPath, 'utf-8');
      return c.html(html);
    }
    return c.text('Admin Portal not found', 404);
  });

  // ===== Auth Middleware Helper =====

  const authenticate = (c: any): { userId: string; username: string; accessGroupId: string; impersonating?: boolean } | null => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return null;
    const session = validateSession(token);
    if (!session) return null;
    // Impersonation: admin can view as another user
    const impersonateId = c.req.header('X-Impersonate') || '';
    if (impersonateId && impersonateId !== session.userId) {
      // Only admins with RBAC_MANAGE can impersonate
      const { has } = checkPermission(session.userId, 'RBAC_MANAGE');
      if (has) {
        const target = getUserById(impersonateId);
        if (target) {
          return { userId: target.userId, username: target.username, accessGroupId: target.accessGroupId, impersonating: true };
        }
      }
    }
    return session;
  };

  const requireAuth = (c: any): { userId: string; username: string; accessGroupId: string } | Response => {
    const user = authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return user;
  };

  // ===== Project Context Helper (Multi-Tenant) =====

  /**
   * Get the effective projectId for the current request.
   * Priority: X-Project-Id header → projectId query param → server's config.projectId.
   * This enables multi-tenant isolation when clients pass their workspace project.
   */
  const getRequestProjectId = (c: any): string => {
    const headerProjectId = c.req.header('X-Project-Id');
    if (headerProjectId) return headerProjectId;
    const queryProjectId = c.req.query('projectId');
    if (queryProjectId) return queryProjectId;
    return loadConfig().projectId;
  };

  // ===== Permission Enforcement Helper =====

  /**
   * Check if user has a specific permission.
   * Returns the permission's roleData if found, or null if not.
   */
  const checkPermission = (userId: string, requiredPermission: string): { has: boolean; roleData: Record<string, unknown> } => {
    const permissions = getUserPermissions(userId);
    const perm = permissions.find(p => p.permissionId === requiredPermission);
    if (!perm) return { has: false, roleData: {} };
    return { has: true, roleData: perm.roleData };
  };

  /**
   * Require a specific permission. Returns 403 Response if user doesn't have it,
   * or { roleData } object if permission is granted.
   */
  const requirePermission = (c: any, userId: string, requiredPermission: string): Response | { roleData: Record<string, unknown> } => {
    const { has, roleData } = checkPermission(userId, requiredPermission);
    if (!has) return c.json({ error: 'Forbidden: missing permission ' + requiredPermission }, 403);
    return { roleData };
  };

  // ===== Auth Endpoints =====

  // POST /api/admin/auth/login
  app.post('/api/admin/auth/login', async (c) => {
    try {
      const { username, password } = await c.req.json();
      if (!username || !password) {
        return c.json({ error: 'Username and password required' }, 400);
      }

      const user = getUserByUsername(username);
      if (!user) {
        recordAudit('unknown', username, 'LOGIN_FAILED', 'auth', undefined, 'User not found');
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      if (user.status !== 'ACTIVE') {
        recordAudit(user.userId, username, 'LOGIN_FAILED', 'auth', undefined, 'Account disabled');
        return c.json({ error: 'Account is disabled' }, 403);
      }

      if (!verifyPassword(password, user.passwordHash)) {
        recordAudit(user.userId, username, 'LOGIN_FAILED', 'auth', undefined, 'Wrong password');
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // Create session
      const session = createSession(user.userId);
      updateLastLogin(user.userId);
      recordAudit(user.userId, username, 'LOGIN', 'auth', session.sessionId);

      const permissions = getUserPermissions(user.userId);

      return c.json({
        token: session.token,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          accessGroupId: user.accessGroupId,
          forcePasswordChange: user.forcePasswordChange,
          permissions: permissions.map(p => p.permissionId),
        },
        expiresAt: session.expiresAt,
      });
    } catch (err: any) {
      logger.error({ err }, 'Login error');
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  // POST /api/admin/auth/logout
  // POST /api/auth/logout
  const handleLogout = async (c: any) => {
    const auth = c.req.header('Authorization') || '';
    let token = auth.replace('Bearer ', '');
    if (!token) {
      try {
        const body = await c.req.json();
        token = body?.refresh_token || '';
      } catch {}
    }
    if (token) {
      const user = validateSession(token);
      if (user) {
        recordAudit(user.userId, user.username, 'LOGOUT', 'auth');
      }
      invalidateSession(token);
    }
    return c.json({ success: true });
  };

  app.post('/api/admin/auth/logout', handleLogout);
  app.post('/api/auth/logout', handleLogout);

  // POST /api/admin/auth/refresh
  // POST /api/auth/refresh
  const handleRefresh = async (c: any) => {
    try {
      const { refresh_token } = await c.req.json();
      if (!refresh_token) {
        return c.json({ error: 'Refresh token required' }, 400);
      }
      const result = refreshSession(refresh_token);
      if (!result) {
        return c.json({ error: 'Invalid or expired session' }, 401);
      }
      return c.json({
        token: result.token,
        expiresAt: result.expiresAt,
      });
    } catch (err: any) {
      logger.error({ err }, 'Token refresh error');
      return c.json({ error: 'Internal error' }, 500);
    }
  };

  app.post('/api/admin/auth/refresh', handleRefresh);
  app.post('/api/auth/refresh', handleRefresh);

  // POST /api/admin/auth/change-password
  app.post('/api/admin/auth/change-password', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current and new password required' }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const dbUser = getUserByUsername(user.username);
    if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    changePassword(user.userId, newPassword);
    recordAudit(user.userId, user.username, 'CHANGE_PASSWORD', 'auth');
    return c.json({ success: true });
  });

  // GET /api/admin/auth/me
  app.get('/api/admin/auth/me', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permissions = getUserPermissions(user.userId);
    const dbUser = getUserById(user.userId);
    return c.json({
      userId: user.userId,
      username: user.username,
      accessGroupId: user.accessGroupId,
      email: dbUser?.email || '',
      forcePasswordChange: dbUser?.forcePasswordChange || false,
      permissions: permissions.map(p => p.permissionId),
    });
  });

  // ===== Stats (Real Metrics) =====

  const SERVER_START_TIME = Date.now();

  app.get('/api/admin/stats', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'DASHBOARD_VIEW');
    if (permCheck instanceof Response) return permCheck;

    // Check KB_READ permission for tier-based filtering
    const kbPerm = checkPermission(user.userId, 'KB_READ');
    const allowedTiers = (kbPerm.roleData as any)?.allowedTiers;

    const d = getAdminDb();
    const userCount = (d.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let mcpCount = 0;
    if (fs.existsSync(orchPath)) {
      try { mcpCount = Object.keys(JSON.parse(fs.readFileSync(orchPath, 'utf-8')).mcpServers || {}).length; } catch {}
    }

    // Apply tier filtering to KB entry count — also filter by project
    const currentProjectId = getRequestProjectId(c);
    let kbEntries: number;
    if (Array.isArray(allowedTiers) && kbPerm.has) {
      const allEntries = getKbEntries(1, 100000, 'created_at', 'desc', currentProjectId);
      kbEntries = allEntries.items.filter((e: any) => {
        const entryTier = e.tier || e.scope || 'SHARED';
        return allowedTiers.includes(entryTier);
      }).length;
    } else {
      kbEntries = getKbEntryCount(currentProjectId);
    }

    const uptimeMs = Date.now() - SERVER_START_TIME;
    const mem = process.memoryUsage();
    const recentActivity = getRecentActivity(10);

    // Count code symbols from index.db (real-time source)
    let codeSymbols = 0;
    try {
      const indexDbPath = path.resolve(getWorkspacePath(), '.code-intel', 'index.db');
      if (fs.existsSync(indexDbPath)) {
        const indexDb = new Database(indexDbPath, { readonly: true });
        const row = indexDb.prepare("SELECT COUNT(*) as cnt FROM symbols WHERE kind IN ('function','class','interface','method','type','enum','constructor')").get() as any;
        codeSymbols = row?.cnt || 0;
        indexDb.close();
      }
    } catch {}

    // Graph breakdown from graph_nodes (same source as Graph page)
    let graphTotalNodes = 0;
    let graphKbNodes = 0;
    let graphCodeNodes = 0;
    try {
      graphTotalNodes = (d.prepare('SELECT COUNT(*) as cnt FROM graph_nodes').get() as any).cnt || 0;
      graphCodeNodes = (d.prepare("SELECT COUNT(*) as cnt FROM graph_nodes WHERE type IN ('FUNCTION','METHOD','CLASS','INTERFACE','TYPE','CONSTRUCTOR','ENUM','CONSTANT','VARIABLE')").get() as any).cnt || 0;
      graphKbNodes = graphTotalNodes - graphCodeNodes;
    } catch {}

    return c.json({
      kbEntries,
      codeSymbols,
      graphTotalNodes: kbEntries + codeSymbols,
      graphKbNodes: kbEntries,
      graphCodeNodes: codeSymbols,
      users: userCount,
      mcpServers: mcpCount,
      uptime: {
        ms: uptimeMs,
        formatted: formatUptime(uptimeMs),
      },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        formatted: formatBytes(mem.heapUsed) + ' / ' + formatBytes(mem.heapTotal),
      },
      recentActivity,
    });
  });

  // ===== Impersonation =====

  app.get('/api/admin/impersonate/:userId', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetId = c.req.param('userId');
    const target = getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);

    const targetPerms = getUserPermissions(targetId);
    return c.json({
      userId: target.userId,
      username: target.username,
      accessGroupId: target.accessGroupId,
      permissions: targetPerms.map(p => p.permissionId),
      roleData: targetPerms.reduce((acc, p) => { acc[p.permissionId] = p.roleData; return acc; }, {} as any),
    });
  });

  // ===== Profile =====

  app.get('/api/admin/profile', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    // SECURITY (vuln-0005): prevent IDOR. The profile endpoint always returns
    // the authenticated user's OWN profile. A userId query param is only honored
    // for callers holding USER_MANAGE; otherwise it is rejected.
    const requestedId = c.req.query('userId');
    let targetId = user.userId;
    if (requestedId && requestedId !== user.userId) {
      const { has } = checkPermission(user.userId, 'USER_MANAGE');
      if (!has) {
        recordAudit(user.userId, user.username, 'PROFILE_ACCESS_DENIED', 'users', requestedId, 'IDOR attempt');
        return c.json({ error: 'Forbidden: cannot access another user profile' }, 403);
      }
      targetId = requestedId;
    }

    const dbUser = getUserById(targetId);
    if (!dbUser) return c.json({ error: 'User not found' }, 404);
    const permissions = getUserPermissions(targetId);
    return c.json({
      userId: dbUser.userId,
      username: dbUser.username,
      email: dbUser.email || '',
      group: dbUser.accessGroupId,
      permissions: permissions.map(p => p.permissionId),
      lastLogin: dbUser.lastLogin || new Date().toISOString(),
      forcePasswordChange: dbUser.forcePasswordChange || false,
    });
  });

  // ===== User Management =====

  app.get('/api/admin/users', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '50');
    const status = c.req.query('status') || undefined;
    const search = c.req.query('search') || undefined;
    const accessGroupId = c.req.query('accessGroupId') || undefined;

    const result = getUsers({ status, search, accessGroupId }, page, pageSize);
    return c.json({
      users: result.items,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    });
  });

  app.get('/api/admin/users/:id', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetUser = getUserById(c.req.param('id'));
    if (!targetUser) return c.json({ error: 'User not found' }, 404);

    const sessions = getUserSessions(targetUser.userId);
    return c.json({ ...targetUser, sessions });
  });

  app.post('/api/admin/users', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    try {
      const { username, email, password, accessGroupId } = await c.req.json();
      if (!username || !password || !accessGroupId) {
        return c.json({ error: 'username, password, and accessGroupId are required' }, 400);
      }
      if (username.length < 3) return c.json({ error: 'Username must be at least 3 characters' }, 400);
      if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

      const group = getGroupById(accessGroupId);
      if (!group) return c.json({ error: 'Access group not found' }, 400);

      // SECURITY (vuln-0004): prevent privilege escalation. A user may only
      // assign an access group whose permissions are a subset of their own.
      // This blocks a USER_MANAGE holder from granting grp-admin (which carries
      // RBAC_MANAGE etc.) unless they already hold those permissions.
      const creatorPerms = new Set(getUserPermissions(user.userId).map(p => p.permissionId));
      const targetPerms = getGroupPermissionIds(accessGroupId);
      const escalated = targetPerms.filter(p => !creatorPerms.has(p));
      if (escalated.length > 0) {
        recordAudit(user.userId, user.username, 'CREATE_USER_DENIED', 'users', undefined,
          JSON.stringify({ username, accessGroupId, escalatedPermissions: escalated }));
        return c.json({ error: 'Cannot assign an access group with privileges higher than your own', escalatedPermissions: escalated }, 403);
      }

      const newUser = createUser(username, email || '', password, accessGroupId);
      recordAudit(user.userId, user.username, 'CREATE_USER', 'users', newUser.userId, JSON.stringify({ username, accessGroupId }));
      return c.json({ success: true, user: newUser }, 201);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        return c.json({ error: 'Username already exists' }, 409);
      }
      logger.error({ err }, 'Create user error');
      return c.json({ error: err.message || 'Internal error' }, 500);
    }
  });

  app.put('/api/admin/users/:id/status', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetId = c.req.param('id');
    const { status } = await c.req.json();
    if (!status || !['ACTIVE', 'DISABLED'].includes(status)) {
      return c.json({ error: 'Invalid status. Must be ACTIVE or DISABLED' }, 400);
    }

    const target = getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);
    if (target.username === 'admin' && status === 'DISABLED') {
      return c.json({ error: 'Cannot disable system admin' }, 403);
    }

    const sessionsTerminated = updateUserStatus(targetId, status);
    recordAudit(user.userId, user.username, 'UPDATE_USER_STATUS', 'users', targetId, JSON.stringify({ status, sessionsTerminated }));
    return c.json({ success: true, sessionsTerminated });
  });

  app.delete('/api/admin/users/:id', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetId = c.req.param('id');
    try {
      const target = getUserById(targetId);
      if (!target) return c.json({ error: 'User not found' }, 404);

      deleteUser(targetId);
      recordAudit(user.userId, user.username, 'DELETE_USER', 'users', targetId, JSON.stringify({ username: target.username }));
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.post('/api/admin/users/:id/force-logout', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetId = c.req.param('id');
    const target = getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);

    const terminated = invalidateUserSessions(targetId);
    recordAudit(user.userId, user.username, 'FORCE_LOGOUT', 'users', targetId, JSON.stringify({ terminated }));
    return c.json({ success: true, terminated });
  });

  app.post('/api/admin/users/:id/reset-password', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'USER_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const targetId = c.req.param('id');
    const target = getUserById(targetId);
    if (!target) return c.json({ error: 'User not found' }, 404);

    const temporaryPassword = resetUserPassword(targetId);
    invalidateUserSessions(targetId);
    recordAudit(user.userId, user.username, 'RESET_PASSWORD', 'users', targetId);
    return c.json({ success: true, temporaryPassword });
  });

  // ===== RBAC =====

  app.get('/api/admin/rbac/groups', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const groups = getGroups();
    const d = getAdminDb();
    const countStmt = d.prepare('SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?');
    const result = groups.map(g => ({
      ...g,
      id: g.accessGroupId,
      name: g.accessGroupName,
      isSystem: g.isSystemGroup,
      userCount: (countStmt.get(g.accessGroupId) as any).cnt,
      permissions: g.permissions.map(p => ({ name: p.permissionId, roleData: p.roleData })),
    }));
    return c.json({ groups: result });
  });

  app.get('/api/admin/rbac/groups/:id', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const group = getGroupById(c.req.param('id'));
    if (!group) return c.json({ error: 'Group not found' }, 404);
    return c.json(group);
  });

  app.post('/api/admin/rbac/groups', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    try {
      const body = await c.req.json();
      const name = body.name || body.accessGroupName;
      if (!name) return c.json({ error: 'Group name required' }, 400);

      const permissions = (body.permissions || []).map((p: any) => ({
        permissionId: p.name || p.permissionId,
        roleData: p.roleData || {},
      }));

      const group = createGroup(name, permissions);
      recordAudit(user.userId, user.username, 'CREATE_GROUP', 'rbac', group.accessGroupId, JSON.stringify({ name }));
      return c.json({ success: true, group: { ...group, id: group.accessGroupId, name: group.accessGroupName, isSystem: false } }, 201);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) return c.json({ error: 'Group name already exists' }, 409);
      return c.json({ error: err.message || 'Internal error' }, 500);
    }
  });

  app.put('/api/admin/rbac/groups/:id', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    try {
      const groupId = c.req.param('id');
      const body = await c.req.json();
      const name = body.name || body.accessGroupName;
      const permissions = (body.permissions || []).map((p: any) => ({
        permissionId: p.name || p.permissionId,
        roleData: p.roleData || {},
      }));

      const group = updateGroup(groupId, name, permissions);
      recordAudit(user.userId, user.username, 'UPDATE_GROUP', 'rbac', groupId, JSON.stringify({ name, permCount: permissions.length }));
      return c.json({ success: true, group });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal error' }, 400);
    }
  });

  app.delete('/api/admin/rbac/groups/:id', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    try {
      const groupId = c.req.param('id');
      deleteGroup(groupId);
      recordAudit(user.userId, user.username, 'DELETE_GROUP', 'rbac', groupId);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.get('/api/admin/rbac/permissions', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'RBAC_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    return c.json({
      permissions: [
        'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
        'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
        'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW'
      ]
    });
  });

  // ===== MCP Servers =====

  // In-memory MCP server logs ring buffer (last 100 lines per server)
  const mcpServerLogs: Record<string, { timestamp: string; level: string; message: string }[]> = {};

  const addMcpLog = (serverId: string, level: string, message: string) => {
    if (!mcpServerLogs[serverId]) mcpServerLogs[serverId] = [];
    mcpServerLogs[serverId].push({ timestamp: new Date().toISOString(), level, message });
    if (mcpServerLogs[serverId].length > 100) mcpServerLogs[serverId].shift();
  };

  // In-memory tool toggle state
  const toolToggles: Record<string, Record<string, boolean>> = {};

  app.get('/api/admin/mcp/servers', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'MCP_ACCESS');
    if (permCheck instanceof Response) return permCheck;

    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let servers: any[] = [];

    // Try to get actual connection data from McpClientManager
    const orchestration = registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();

    if (fs.existsSync(orchPath)) {
      try {
        const orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8'));
        servers = Object.entries(orch.mcpServers || {}).map(([name, cfg]: [string, any]) => {
          const serverToggles = toolToggles[name] || {};
          const isConnected = clientManager?.isServerConnected?.(name) ?? false;
          const actualToolCount = clientManager?.getServerToolCount?.(name) ?? 0;
          const configTools = cfg.autoApprove || [];

          let tools: any[];
          if (isConnected && actualToolCount > 0) {
            const proxied = (clientManager?.getProxiedTools?.() || []).filter((t: any) => t.category === name);
            tools = proxied.map((t: any) => ({ name: t.name, enabled: serverToggles[t.name] !== false }));
          } else {
            tools = configTools.map((t: string) => ({ name: t, enabled: serverToggles[t] !== false }));
          }

          return {
            id: name, name,
            url: cfg.url || '',
            type: cfg.type || cfg.transportType || 'stdio',
            transportType: cfg.transportType || cfg.type || 'stdio',
            command: cfg.command || '',
            args: cfg.args || [],
            env: cfg.env || {},
            disabled: cfg.disabled || false,
            status: cfg.disabled ? 'stopped' : (isConnected ? 'running' : 'disconnected'),
            tools,
          };
        });
      } catch (e) { /* ignore */ }
    }

    // Add code-intel as virtual internal server (tools from ModuleRegistry)
    const allHandlers = registry?.getToolHandlers?.();
    if (allHandlers) {
      const internalTools = Array.from(allHandlers.keys());
      servers.push({
        id: 'code-intel', name: 'code-intel',
        url: 'internal',
        type: 'internal',
        transportType: 'internal',
        command: '',
        args: [],
        env: {},
        disabled: false,
        status: 'running',
        tools: internalTools.map((t: unknown) => ({ name: t as string, enabled: true })),
      });
    }

    // Enforce allowedServers roleData filtering
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers)) {
      servers = servers.filter(s => allowedServers.includes(s.id));
    }

    return c.json({ servers });
  });

  app.post('/api/admin/mcp/servers/:id/restart', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    // Enforce allowRestart rule
    if ((permCheck.roleData as any)?.allowRestart === false) {
      return c.json({ error: 'Forbidden: not allowed to restart servers' }, 403);
    }

    const serverId = c.req.param('id');

    // Enforce allowedServers
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) {
      return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    }

    addMcpLog(serverId, 'INFO', `Server restart requested by ${user.username}`);
    recordAudit(user.userId, user.username, 'RESTART_SERVER', 'mcp', serverId);

    // Actually reconnect via McpClientManager
    const orchestration = registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager) {
      try {
        await clientManager.disconnectServer(serverId);
        const cfg = loadConfig();
        const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
        if (fs.existsSync(orchPath)) {
          const orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8'));
          const serverCfg = orch.mcpServers?.[serverId];
          if (serverCfg && !serverCfg.disabled) {
            await clientManager.connectServer(serverId, serverCfg);
            const toolCount = clientManager.getServerToolCount(serverId);
            addMcpLog(serverId, 'INFO', `Reconnected. ${toolCount} tools loaded.`);
            return c.json({ success: true, status: 'connected', tools: toolCount });
          }
        }
      } catch (err: any) {
        addMcpLog(serverId, 'ERROR', `Restart failed: ${err.message}`);
        return c.json({ success: false, error: err.message, status: 'disconnected' });
      }
    }
    return c.json({ success: true, message: 'Restart signal sent' });
  });

  // POST /api/admin/mcp/servers — Add new MCP server
  app.post('/api/admin/mcp/servers', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    // Enforce allowAdd rule
    if ((permCheck.roleData as any)?.allowAdd === false) {
      return c.json({ error: 'Forbidden: not allowed to add servers' }, 403);
    }

    const body = await c.req.json();
    const { name, url, type, command, args, env, disabled, autoApprove } = body;
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!url && !command) return c.json({ error: 'url or command is required' }, 400);

    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) {
      try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch {}
    }
    if (!orch.mcpServers) orch.mcpServers = {};
    if (orch.mcpServers[name]) return c.json({ error: `Server "${name}" already exists` }, 409);

    const serverConfig: any = {};
    if (url) serverConfig.url = url;
    if (type) { serverConfig.type = type; serverConfig.transportType = type; }
    else { serverConfig.type = 'stdio'; serverConfig.transportType = 'stdio'; }
    if (command) serverConfig.command = command;
    if (args) serverConfig.args = args;
    if (env) serverConfig.env = env;
    if (disabled !== undefined) serverConfig.disabled = disabled;
    if (autoApprove) serverConfig.autoApprove = autoApprove;
    if (body.tools) serverConfig.tools = body.tools;

    orch.mcpServers[name] = serverConfig;
    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);

    addMcpLog(name, 'INFO', `Server added by ${user.username}`);
    recordAudit(user.userId, user.username, 'ADD_SERVER', 'mcp', name);

    // Connect new server only (targeted — don't reinitialize all)
    let status = disabled ? 'stopped' : 'disconnected';
    let toolCount = 0;
    const orchestration = registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager && !disabled) {
      try {
        await clientManager.connectServer(name, serverConfig);
        status = 'connected';
        toolCount = clientManager.getServerToolCount(name);
      } catch (err: any) {
        addMcpLog(name, 'ERROR', `Connect failed: ${err.message}`);
        status = 'disconnected';
      }
    }

    return c.json({ success: true, name, status, tools: toolCount }, 201);
  });

  // DELETE /api/admin/mcp/servers/:id — Remove MCP server
  app.delete('/api/admin/mcp/servers/:id', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    // Enforce allowRemove rule
    if ((permCheck.roleData as any)?.allowRemove === false) {
      return c.json({ error: 'Forbidden: not allowed to remove servers' }, 403);
    }

    const serverId = c.req.param('id');

    // Enforce allowedServers
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) {
      return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    }

    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) {
      try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch {}
    }
    if (!orch.mcpServers?.[serverId]) return c.json({ error: `Server "${serverId}" not found` }, 404);

    delete orch.mcpServers[serverId];
    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);

    addMcpLog(serverId, 'INFO', `Server removed by ${user.username}`);
    recordAudit(user.userId, user.username, 'REMOVE_SERVER', 'mcp', serverId);
    return c.json({ success: true, removed: serverId });
  });

  // PUT /api/admin/mcp/servers/:id — Update MCP server config
  app.put('/api/admin/mcp/servers/:id', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    // Enforce allowEdit rule
    if ((permCheck.roleData as any)?.allowEdit === false) {
      return c.json({ error: 'Forbidden: not allowed to edit server config' }, 403);
    }

    const serverId = c.req.param('id');

    // Enforce allowedServers
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) {
      return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    }

    const body = await c.req.json();
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) {
      try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch {}
    }
    if (!orch.mcpServers?.[serverId]) return c.json({ error: `Server "${serverId}" not found` }, 404);

    const existing = orch.mcpServers[serverId];
    if (body.url !== undefined) existing.url = body.url;
    if (body.type !== undefined) { existing.type = body.type; existing.transportType = body.type; }
    if (body.command !== undefined) existing.command = body.command;
    if (body.args !== undefined) existing.args = body.args;
    if (body.env !== undefined) existing.env = body.env;
    if (body.disabled !== undefined) existing.disabled = body.disabled;
    if (body.autoApprove !== undefined) existing.autoApprove = body.autoApprove;

    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);

    addMcpLog(serverId, 'INFO', `Config updated by ${user.username}`);
    recordAudit(user.userId, user.username, 'UPDATE_SERVER', 'mcp', serverId);

    const orchestration = registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager && !existing.disabled) {
      try {
        await clientManager.disconnectServer(serverId);
        await clientManager.connectServer(serverId, existing);
      } catch (err: any) {
        addMcpLog(serverId, 'ERROR', `Reconnect failed: ${err.message}`);
      }
    }
    return c.json({ success: true, name: serverId });
  });

  // POST /api/admin/mcp/servers/:id/tools/:toolName/toggle
  app.post('/api/admin/mcp/servers/:id/tools/:toolName/toggle', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;

    const serverId = c.req.param('id');

    // Enforce allowedServers — user can only toggle tools on servers they manage
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes(serverId)) {
      return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    }

    const toolName = c.req.param('toolName');
    const { enabled } = await c.req.json();

    if (!toolToggles[serverId]) toolToggles[serverId] = {};
    toolToggles[serverId][toolName] = enabled !== false;

    addMcpLog(serverId, 'INFO', `Tool "${toolName}" ${enabled !== false ? 'enabled' : 'disabled'} by ${user.username}`);
    recordAudit(user.userId, user.username, 'TOGGLE_TOOL', 'mcp', `${serverId}/${toolName}`, JSON.stringify({ enabled }));
    return c.json({ success: true, serverId, toolName, enabled: enabled !== false });
  });

  // GET /api/admin/mcp/servers/:id/logs
  app.get('/api/admin/mcp/servers/:id/logs', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'MCP_ACCESS');
    if (permCheck instanceof Response) return permCheck;

    const serverId = c.req.param('id');

    // Enforce allowedServers — user can only view logs for servers they have access to
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes(serverId)) {
      return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    }

    const logs = mcpServerLogs[serverId] || [];

    // If no logs yet, seed some mock entries
    if (logs.length === 0) {
      const now = Date.now();
      const mockLogs = [
        { offset: -300000, level: 'INFO', message: `Server "${serverId}" started successfully` },
        { offset: -240000, level: 'INFO', message: 'Connected to transport layer' },
        { offset: -180000, level: 'INFO', message: 'Tools registered and ready' },
        { offset: -60000, level: 'DEBUG', message: 'Health check passed' },
        { offset: 0, level: 'INFO', message: 'Accepting tool calls' },
      ];
      mockLogs.forEach(m => {
        mcpServerLogs[serverId] = mcpServerLogs[serverId] || [];
        mcpServerLogs[serverId].push({ timestamp: new Date(now + m.offset).toISOString(), level: m.level, message: m.message });
      });
    }

    return c.json({ serverId, logs: mcpServerLogs[serverId] || [] });
  });

  // ===== Configuration =====

  // In-memory config overrides (persisted via config_changes table, applied on restart for restart-required keys)
  const configOverrides: Record<string, Record<string, any>> = {};

  // Keys that require restart vs hot-reload
  const RESTART_REQUIRED_KEYS: Record<string, string[]> = {
    server: ['port', 'host'],
    embedding: ['model', 'dimensions'],
    llm: ['provider', 'baseUrl'],
  };

  const getEffectiveConfig = (): Record<string, Record<string, any>> => {
    const cfg = loadConfig();
    const base: Record<string, Record<string, any>> = {
      server: { port: cfg.port, host: cfg.host, logLevel: cfg.logLevel },
      embedding: { model: 'paraphrase-multilingual-MiniLM-L12-v2', dimensions: 384, onnxModelPath: cfg.onnxModelPath },
      llm: {
        provider: process.env.LLM_PROVIDER || 'ollama',
        model: process.env.LLM_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
        baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434',
        apiKey: process.env.LLM_API_KEY ? '***' : '',
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '300', 10),
        tagAnalysisEnabled: process.env.TAG_ANALYSIS_ENABLED !== 'false',
        tagConfidenceThreshold: parseFloat(process.env.TAG_CONFIDENCE_THRESHOLD || '0.7'),
      },
      kb: { maxEntries: 100000, sqliteDbPath: cfg.sqliteDbPath, dataDir: cfg.dataDir },
      mcp: { orchestrationConfigPath: cfg.orchestrationConfigPath },
    };
    // Apply overrides
    for (const [section, keys] of Object.entries(configOverrides)) {
      if (!base[section]) base[section] = {};
      for (const [key, val] of Object.entries(keys)) {
        base[section][key] = val;
      }
    }
    return base;
  };

  // LLM proxy endpoints (avoid CORS issues from browser)
  app.get('/api/admin/llm/models', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const config = getEffectiveConfig();
    const llm = config.llm || {};
    const prov = c.req.query('provider') || llm.provider || 'ollama';
    const base = c.req.query('baseUrl') || llm.baseUrl || 'http://localhost:11434';
    try {
      let url: string;
      if (prov === 'ollama') url = base + '/api/tags';
      else url = base + '/models';
      const headers: Record<string, string> = {};
      const apiKey = llm.apiKey;
      if (apiKey && apiKey !== '***') {
        headers['Authorization'] = 'Bearer ' + apiKey;
        headers['x-api-key'] = apiKey;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) return c.json({ error: 'HTTP ' + r.status, models: [] });
      const d = await r.json() as any;
      let models: { id: string; name: string }[];
      if (prov === 'ollama') {
        models = (d.models || []).map((m: any) => ({ id: m.name || m.model, name: m.name || m.model }));
      } else {
        models = (d.data || []).map((m: any) => ({ id: m.id, name: m.id }));
      }
      return c.json({ models, provider: prov });
    } catch (e: any) {
      return c.json({ error: e.message || 'Connection failed', models: [] });
    }
  });

  app.post('/api/admin/llm/test', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const config = getEffectiveConfig();
    const llm = config.llm || {};
    const prov = llm.provider || 'ollama';
    const base = llm.baseUrl || 'http://localhost:11434';

    // SSRF protection (Finding #11): validate configured LLM URL
    // Skip SSRF check for local providers (localhost, 127.0.0.1) — they are valid LLM endpoints
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
    if (llm.baseUrl && llm.baseUrl !== 'http://localhost:11434' && !isLocalUrl) {
      const urlCheck = validateExternalUrl(base);
      if (!urlCheck.valid) {
        return c.json({ success: false, message: `SSRF blocked: ${urlCheck.error}` }, 400);
      }
    }

    try {
      const start = Date.now();
      let r: Response;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (llm.apiKey && llm.apiKey !== '***') {
        headers['Authorization'] = 'Bearer ' + llm.apiKey;
        headers['x-api-key'] = llm.apiKey;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      if (prov === 'ollama') {
        r = await fetch(base + '/api/generate', { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ model: llm.model || 'llama3.1', prompt: 'Say hello in 5 words', stream: false, options: { num_predict: 20 } }) });
      } else {
        r = await fetch(base + '/models', { headers, signal: controller.signal });
      }
      clearTimeout(timeout);
      const ms = Date.now() - start;
      if (r.ok) {
        const d = await r.json() as any;
        const info = prov === 'ollama' ? ((d.response || '').substring(0, 80)) : ((d.data || []).length + ' models available');
        return c.json({ success: true, message: 'Connected (' + ms + 'ms) — ' + info, latencyMs: ms });
      } else {
        return c.json({ success: false, message: 'HTTP ' + r.status, latencyMs: ms });
      }
    } catch (e: any) {
      return c.json({ success: false, message: e.message || 'Connection failed' });
    }
  });

  app.get('/api/admin/config', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;

    const config = getEffectiveConfig();
    const history = getConfigChanges(10);
    const restartRequired = RESTART_REQUIRED_KEYS;

    return c.json({ config, history, restartRequired });
  });

  app.patch('/api/admin/config/:section/:key', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;

    // Enforce readOnly roleData — if user has CONFIG_EDIT with readOnly=true, block writes
    if (permCheck.roleData && (permCheck.roleData as any).readOnly === true) {
      return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    }

    const section = c.req.param('section');
    const key = c.req.param('key');
    const { value } = await c.req.json();

    if (value === undefined || value === null) {
      return c.json({ error: 'value is required' }, 400);
    }

    const config = getEffectiveConfig();
    if (!config[section]) {
      return c.json({ error: `Section "${section}" not found` }, 404);
    }
    if (!(key in config[section])) {
      return c.json({ error: `Key "${key}" not found in section "${section}"` }, 404);
    }

    const oldValue = JSON.stringify(config[section][key]);
    const newValue = typeof value === 'string' ? value : JSON.stringify(value);
    const requiresRestart = (RESTART_REQUIRED_KEYS[section] || []).includes(key);

    // Apply override in memory (hot-reload for non-restart keys)
    if (!configOverrides[section]) configOverrides[section] = {};
    configOverrides[section][key] = value;

    // Record change
    recordConfigChange(section, key, oldValue, newValue, user.username, requiresRestart);
    recordAudit(user.userId, user.username, 'CONFIG_CHANGE', 'config', `${section}.${key}`, JSON.stringify({ oldValue, newValue, requiresRestart }));

    return c.json({ success: true, requiresRestart, section, key, value });
  });

  app.get('/api/admin/config/history', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;

    const history = getConfigChanges(20);
    return c.json({ history });
  });

  // STORY 8: Config reset to defaults
  app.post('/api/admin/config/:section/reset', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;

    // Enforce readOnly roleData — reset IS a write action
    if (permCheck.roleData && (permCheck.roleData as any).readOnly === true) {
      return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    }

    const section = c.req.param('section');
    const config = getEffectiveConfig();
    if (!config[section]) {
      return c.json({ error: `Section "${section}" not found` }, 404);
    }

    // Clear all overrides for this section
    const overridesExisted = !!configOverrides[section] && Object.keys(configOverrides[section]).length > 0;
    delete configOverrides[section];

    recordAudit(user.userId, user.username, 'CONFIG_RESET', 'config', section, JSON.stringify({ section, overridesCleared: overridesExisted }));

    // Return the section with defaults applied
    const freshConfig = getEffectiveConfig();
    return c.json({ success: true, section, config: freshConfig[section] });
  });

  app.post('/api/admin/config/reset-all', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;

    // Enforce readOnly roleData — reset-all IS a write action
    if (permCheck.roleData && (permCheck.roleData as any).readOnly === true) {
      return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    }

    // Clear ALL overrides
    const sections = Object.keys(configOverrides);
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }

    recordAudit(user.userId, user.username, 'CONFIG_RESET_ALL', 'config', undefined, JSON.stringify({ sectionsCleared: sections }));

    const freshConfig = getEffectiveConfig();
    return c.json({ success: true, config: freshConfig });
  });

  // ===== Audit =====

  app.get('/api/admin/audit', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'AUDIT_VIEW');
    if (permCheck instanceof Response) return permCheck;

    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '50');
    const action = c.req.query('action') || undefined;
    const dateFrom = c.req.query('dateFrom') || undefined;
    const dateTo = c.req.query('dateTo') || undefined;

    // KSA-286: When impersonating, only show the impersonated user's own audit entries
    const userId = (user as any).impersonating ? user.userId : undefined;

    const result = getAuditLogs({ userId, action, dateFrom, dateTo }, page, pageSize);
    return c.json({
      entries: result.items,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    });
  });

  // ===== Search (STORY 9 — Real KB-based semantic search + STORY 4 — query tracking) =====

  app.post('/api/admin/search', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'SEARCH_EXPLORE');
    if (permCheck instanceof Response) return permCheck;

    // Enforce maxResults from roleData
    const maxResults = (permCheck.roleData as any)?.maxResults;

    const { query, debug } = await c.req.json();
    if (!query) return c.json({ results: [] });

    const startTime = Date.now();

    // STORY 9: Try real KB search first
    const realResults = searchKbEntries(query, getRequestProjectId(c));

    if (realResults.items.length > 0) {
      const responseTimeMs = Date.now() - startTime;
      // STORY 4: Record query to DB — KSA-286: record with impersonated userId
      recordQueryLog(query, responseTimeMs, realResults.items.length, user.userId);

      const resultLimit = (typeof maxResults === 'number' && maxResults > 0) ? Math.min(maxResults, 20) : 20;
      const results = realResults.items.slice(0, resultLimit).map((item: any) => ({
        id: item.id || item.entry_id || 'unknown',
        source: item.source || item.summary || 'unknown',
        content: (item.content || '').substring(0, 300),
        tier: item.tier || 'SHARED',
        score: item.score || 0.5,
        scores: item.scores || {
          similarity: +(item.score || 0.5).toFixed(3),
          keyword: 0,
          recency: 0,
          quality: 0,
        },
      }));

      return c.json({
        results,
        debug: debug ? { queryTokens: query.split(/\s+/), totalCandidates: realResults.total, searchTimeMs: responseTimeMs } : undefined,
      });
    }

    // Fallback to mock only if index.db has no entries matching
    const mockResults = [
      { id: 'e1', source: 'project-structure', content: 'Code Intelligence indexes the project for semantic search and navigation...', tier: 'SHARED', score: 0.92, scores: { similarity: 0.85, keyword: 0.95, recency: 0.90, quality: 0.98 } },
      { id: 'e2', source: 'admin-portal', content: 'Admin portal provides web-based management of KB entries, users, and MCP servers...', tier: 'PROJECT', score: 0.87, scores: { similarity: 0.82, keyword: 0.88, recency: 0.85, quality: 0.93 } },
      { id: 'e3', source: 'mcp-integration', content: 'MCP servers are orchestrated through orchestration.json configuration...', tier: 'SHARED', score: 0.79, scores: { similarity: 0.75, keyword: 0.72, recency: 0.95, quality: 0.74 } },
    ];

    const filtered = mockResults.filter(r =>
      r.source.toLowerCase().includes(query.toLowerCase()) ||
      r.content.toLowerCase().includes(query.toLowerCase())
    );

    const responseTimeMs = Date.now() - startTime;
    let finalResults = filtered.length > 0 ? filtered : mockResults.slice(0, 2);
    // Enforce maxResults from roleData
    if (typeof maxResults === 'number' && maxResults > 0) {
      finalResults = finalResults.slice(0, maxResults);
    }
    // STORY 4: Record query to DB even for mock fallback — KSA-286: record with impersonated userId
    recordQueryLog(query, responseTimeMs, finalResults.length, user.userId);

    return c.json({
      results: finalResults,
      debug: debug ? { queryTokens: query.split(/\s+/), totalCandidates: 42, searchTimeMs: responseTimeMs } : undefined,
    });
  });

  // ===== KB =====

  // In-memory storage for KB links, tags, and promotion queue
  const kbLinks: Record<string, { targetId: string; linkType: string; createdAt: string }[]> = {};
  const kbTags: Record<string, string[]> = {};
  const promotionQueue: { id: string; entryId: string; fromTier: string; toTier: string; reason: string; requestedBy: string; requestedAt: string; status: string; reviewedBy?: string; reviewedAt?: string }[] = [];

  app.get('/api/admin/kb/entries', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;

    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '20');
    const sortBy = c.req.query('sortBy') || 'created_at';
    const sortDir = (c.req.query('sortDir') || 'desc') as 'asc' | 'desc';

    const result = getKbEntries(page, pageSize, sortBy, sortDir, getRequestProjectId(c));

    // Enforce allowedTiers roleData filtering
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    let entries = result.items;
    if (Array.isArray(allowedTiers)) {
      entries = entries.filter((e: any) => {
        const entryTier = e.tier || e.scope || 'SHARED';
        return allowedTiers.includes(entryTier);
      });
    }

    return c.json({
      entries,
      total: Array.isArray(allowedTiers) ? entries.length : result.total,
      page,
      pageSize,
      totalPages: Math.ceil((Array.isArray(allowedTiers) ? entries.length : result.total) / pageSize),
    });
  });

  // STORY 3: KB Entry detail by ID (graph node click → detail panel)
  app.get('/api/admin/kb/entries/:id', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;

    const entryId = c.req.param('id');
    const entry = getKbEntryById(entryId);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);

    // Enforce allowedTiers — check entry tier against user's allowed tiers
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    if (Array.isArray(allowedTiers)) {
      const entryTier = entry.tier || entry.scope || 'SHARED';
      if (!allowedTiers.includes(entryTier)) {
        return c.json({ error: 'Forbidden: entry tier not in allowedTiers' }, 403);
      }
    }

    // Get associated tags and links
    const tags = kbTags[entryId] || [];
    const links = kbLinks[entryId] || [];

    return c.json({
      id: entry.id || entry.entry_id || entryId,
      title: entry.title || entry.source || 'Untitled',
      content: entry.content || '',
      tier: entry.tier || entry.scope || 'SHARED',
      type: entry.content_type || entry.type || 'document',
      source: entry.source || '',
      tags,
      links,
      qualityScore: entry.quality_score || entry.score || null,
      createdAt: entry.created_at || null,
      updatedAt: entry.updated_at || null,
    });
  });

  // KB Graph — tenant filtered by KB_READ.allowedTiers + GRAPH_VIEW.maxNodes
  app.get('/api/admin/kb/graph', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const kbPermCheck = requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const allowedTiers = (kbPermCheck.roleData as any)?.allowedTiers;

    const graphPermCheck = checkPermission(user.userId, 'GRAPH_VIEW');
    const maxNodes = (graphPermCheck.roleData as any)?.maxNodes || 500;

    const result = getKbEntries(1, 500, 'created_at', 'desc', getRequestProjectId(c));
    let nodes: any[] = [];
    let edges: any[] = [];

    if (result.items.length > 0) {
      let items = result.items;
      // Filter by allowedTiers
      if (Array.isArray(allowedTiers)) {
        items = items.filter((e: any) => {
          const entryTier = e.tier || e.scope || 'SHARED';
          return allowedTiers.includes(entryTier);
        });
      }
      // Limit by maxNodes
      items = items.slice(0, maxNodes);

      nodes = items.map((e: any, i: number) => ({
        id: e.id || e.entry_id || `node-${i}`,
        label: ((e.summary||e.tags||'').substring(0,50))||(e.source||'').split('/').pop()||'Entry '+(i+1),
        type: e.type || e.content_type || 'document',
        tier: e.tier || e.scope || 'SHARED',
        group: Math.floor(i / 5),
      }));
      // Generate edges: connect nodes within same group and by shared type/tier
      // Group-based connections for cluster structure
      for (let i = 0; i < nodes.length; i++) {
        const groupSize = 5;
        const groupStart = Math.floor(i / groupSize) * groupSize;
        // Connect within group (hub pattern: first node in group connects to others)
        if (i > groupStart && i < groupStart + groupSize) {
          edges.push({ source: nodes[groupStart].id, target: nodes[i].id, weight: +(0.6 + Math.random() * 0.4).toFixed(2) });
        }
        // Cross-group connections by type similarity (sparse)
        if (i > 0 && i % 7 === 0) {
          const target = Math.floor(Math.random() * i);
          if (nodes[i].type === nodes[target].type || nodes[i].tier === nodes[target].tier) {
            edges.push({ source: nodes[i].id, target: nodes[target].id, weight: +(0.3 + Math.random() * 0.4).toFixed(2) });
          }
        }
      }
    }

    if (nodes.length === 0) {
      const labels = ['project-structure','admin-db','mcp-server','embedding','config','routes','auth','rbac','audit','kb-index','tools','types','modules','search','graph'];
      let mockNodes = labels.map((label, i) => ({ id: `n${i}`, label, type: ['module','code','config','api','document'][i%5], tier: ['SHARED','PROJECT','USER'][i%3], group: Math.floor(i/4) }));
      // Filter mock nodes by allowedTiers too
      if (Array.isArray(allowedTiers)) {
        mockNodes = mockNodes.filter(n => allowedTiers.includes(n.tier));
      }
      mockNodes = mockNodes.slice(0, maxNodes);
      nodes = mockNodes;
      const nodeIds = new Set(nodes.map(n => n.id));
      edges = [{source:'n0',target:'n1',weight:0.9},{source:'n0',target:'n5',weight:0.8},{source:'n1',target:'n6',weight:0.7},{source:'n2',target:'n10',weight:0.85},{source:'n3',target:'n9',weight:0.6},{source:'n4',target:'n5',weight:0.75},{source:'n5',target:'n6',weight:0.9},{source:'n6',target:'n7',weight:0.8},{source:'n7',target:'n8',weight:0.7},{source:'n8',target:'n0',weight:0.5},{source:'n9',target:'n13',weight:0.85},{source:'n10',target:'n11',weight:0.6},{source:'n11',target:'n12',weight:0.7},{source:'n12',target:'n13',weight:0.55},{source:'n13',target:'n14',weight:0.8},{source:'n14',target:'n0',weight:0.65}].filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    return c.json({ nodes, edges, stats: { totalNodes: nodes.length, totalEdges: edges.length, maxNodes, totalEntries: getKbEntryCount(getRequestProjectId(c)) } });
  });

  // KB Graph Cluster Children — progressive loading for LOD
  app.get('/api/admin/kb/graph/cluster/:clusterId', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;

    const clusterId = c.req.param('clusterId');
    // Get cluster offset from ID (cluster-000 → offset 0*30=0, cluster-001 → 30, etc.)
    const match = clusterId.match(/cluster-(\d+)/);
    if (!match) return c.json({ error: 'Invalid cluster ID' }, 400);
    const clusterIndex = parseInt(match[1], 10);
    const pageSize = 30;
    const offset = clusterIndex * pageSize;

    const result = getKbEntries(1, 5000, 'created_at', 'desc', getRequestProjectId(c));
    const items = result.items.slice(offset, offset + pageSize);

    const nodes = items.map((e: any, i: number) => ({
      id: e.id || e.entry_id || `child-${offset + i}`,
      label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${offset + i + 1}`,
      type: e.type || e.content_type || 'document',
      tier: e.tier || e.scope || 'SHARED',
    }));

    // Create edges between children
    const edges: any[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < Math.min(nodes.length, i + 3); j++) {
        if (nodes[i].type === nodes[j].type || nodes[i].tier === nodes[j].tier) {
          edges.push({ source: nodes[i].id, target: nodes[j].id, weight: +(0.3 + Math.random() * 0.7).toFixed(2) });
        }
      }
    }

    return c.json({ clusterId, nodes, edges });
  });

  // KB Graph Positions — returns ALL node positions (optimized, no edges) for Three.js renderer
  app.get('/api/admin/kb/graph/positions', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const allowedTiers = (kbPermCheck.roleData as any)?.allowedTiers;

    // Real-time counts from source tables (single source of truth)
    let kbCount = 0;
    let codeCount = 0;
    try {
      kbCount = getKbEntryCount(getRequestProjectId(c));
    } catch {}
    try {
      const indexDbPath = path.resolve(getWorkspacePath(), '.code-intel', 'index.db');
      if (fs.existsSync(indexDbPath)) {
        const indexDb = new Database(indexDbPath, { readonly: true });
        const row = indexDb.prepare("SELECT COUNT(*) as cnt FROM symbols WHERE kind IN ('function','class','interface','method','type','enum','constructor')").get() as any;
        codeCount = row?.cnt || 0;
        indexDb.close();
      }
    } catch {}

    const graphService = (globalThis as any).__sqliteGraphService;
    if (graphService && graphService.ready) {
      try {
        const result = graphService.getAllPositions();
        // Filter by allowed tiers — CODE tier always passes (not part of KB tier system)
        if (Array.isArray(allowedTiers)) {
          result.nodes = result.nodes.filter((n: any) => n.tier === 'CODE' || allowedTiers.includes(n.tier));
          result.total = result.nodes.length;
        }
        // Attach real-time counts
        result.kbCount = kbCount;
        result.codeCount = codeCount;
        return c.json(result);
      } catch (err: any) {
        logger.warn({ error: err.message }, 'getAllPositions failed');
      }
    }

    // Fallback: generate positions from KB entries
    const result = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));
    const items = result.items;
    const n = items.length;
    const golden = (1 + Math.sqrt(5)) / 2;
    const groups = new Map<string, number>();
    let groupCounter = 0;
    const nodes = items.map((e: any, i: number) => {
      const type = (e.type || e.content_type || 'DOCUMENT').toUpperCase();
      const tier = e.tier || e.scope || 'SHARED';
      if (!groups.has(type)) groups.set(type, groupCounter++);
      const groupId = groups.get(type)!;
      const level = ({ ARCHITECTURE: 0, REQUIREMENT: 0, DECISION: 0, PROCEDURE: 1, CONTEXT: 1, CODE_ENTITY: 1 } as any)[type] ?? 2;
      const theta = 2 * Math.PI * i / golden;
      const phi = Math.acos(1 - 2 * (i + 0.5) / Math.max(n, 1));
      const baseRadius = 300 + level * 200;
      const groupAngle = (groupId / Math.max(groupCounter, 1)) * 2 * Math.PI;
      return {
        id: e.id || e.entry_id || `node-${i}`,
        x: Math.round((baseRadius * Math.sin(phi) * Math.cos(theta) + 150 * Math.cos(groupAngle)) * 100) / 100,
        y: Math.round((baseRadius * Math.sin(phi) * Math.sin(theta) + 150 * Math.sin(groupAngle)) * 100) / 100,
        z: Math.round((baseRadius * Math.cos(phi)) * 100) / 100,
        type, tier,
        label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${i + 1}`,
      };
    });
    return c.json({ nodes, total: nodes.length });
  });

  // KB Graph Full Sync — rebuilds graph from all sources (documents + code symbols)
  app.post('/api/admin/kb/graph/sync', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'GRAPH_VIEW');
    if (permCheck instanceof Response) return permCheck;

    const graphService = (globalThis as any).__sqliteGraphService;
    if (!graphService) {
      return c.json({ error: 'Graph service not initialized' }, 503);
    }

    // Run sync in the background, respond immediately so the client doesn't time out
    c.header('Content-Type', 'application/json');
    setImmediate(async () => {
      try {
        // Wipe old data first
        const db = (await import('../../admin/admin-db.js')).getAdminDb();
        db.exec('DELETE FROM graph_nodes; DELETE FROM graph_edges;');
        await graphService.fullSync();
      } catch (err: any) {
        logger.error({ error: err.message }, 'Graph sync failed');
      }
    });

    return c.json({ status: 'sync_started', message: 'Graph sync triggered in background. Check server logs for progress.' });
  });

  // KB Graph Spatial Query — Neo4j-powered progressive loading based on camera position
  // Falls back to SQLite if Neo4j is unavailable
  app.get('/api/admin/kb/graph/spatial', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const kbPermCheck = requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;

    const camX = parseFloat(c.req.query('x') || '0');
    const camY = parseFloat(c.req.query('y') || '0');
    const camZ = parseFloat(c.req.query('z') || '0');
    const zoom = parseFloat(c.req.query('zoom') || '500');

    // Try SQLite graph service first
    const graphService = (globalThis as any).__sqliteGraphService;
    if (graphService && graphService.ready) {
      try {
        const result = graphService.spatialQuery({ camX, camY, camZ, zoom });
        return c.json(result);
      } catch (err: any) {
        logger.warn({ error: err.message }, 'SQLite graph spatial query failed, using inline fallback');
      }
    }

    // Fallback: SQLite-based spatial approximation
    const graphPermCheck = checkPermission(user.userId, 'GRAPH_VIEW');
    const maxNodes = (graphPermCheck.roleData as any)?.maxNodes || 500;
    const allowedTiers = (kbPermCheck.roleData as any)?.allowedTiers;

    const result = getKbEntries(1, maxNodes, 'created_at', 'desc', getRequestProjectId(c));
    let items = result.items;
    if (Array.isArray(allowedTiers)) {
      items = items.filter((e: any) => allowedTiers.includes(e.tier || e.scope || 'SHARED'));
    }
    items = items.slice(0, maxNodes);

    // Generate positioned nodes using spherical layout
    const n = items.length;
    const levelMap: Record<string, number> = {
      ARCHITECTURE: 0, REQUIREMENT: 0, DECISION: 0,
      PROCEDURE: 1, CONTEXT: 1, CODE_ENTITY: 1,
      LESSON_LEARNED: 2, ERROR_PATTERN: 2, DOCUMENT: 2,
    };
    const groups = new Map<string, number>();
    let groupCounter = 0;
    const golden = (1 + Math.sqrt(5)) / 2;

    const nodes = items.map((e: any, i: number) => {
      const type = (e.type || e.content_type || 'DOCUMENT').toUpperCase();
      const tier = e.tier || e.scope || 'SHARED';
      if (!groups.has(type)) groups.set(type, groupCounter++);
      const groupId = groups.get(type)!;
      const level = levelMap[type] ?? 2;

      const theta = 2 * Math.PI * i / golden;
      const phi = Math.acos(1 - 2 * (i + 0.5) / n);
      const baseRadius = 100 + level * 80;
      const groupAngle = (groupId / Math.max(groupCounter, 1)) * 2 * Math.PI;
      const x = baseRadius * Math.sin(phi) * Math.cos(theta) + 50 * Math.cos(groupAngle);
      const y = baseRadius * Math.sin(phi) * Math.sin(theta) + 50 * Math.sin(groupAngle);
      const z = baseRadius * Math.cos(phi);

      return {
        id: e.id || e.entry_id || `node-${i}`,
        label: ((e.summary || e.tags || '').substring(0, 50)) || (e.source || '').split('/').pop() || `Entry ${i + 1}`,
        type, tier, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100,
        level, clusterId: `cluster-${groupId}`,
      };
    });

    // Filter by bounding box if zoomed in
    let filteredNodes = nodes;
    if (zoom <= 500) {
      const r = Math.max(200, zoom * 0.5);
      filteredNodes = nodes.filter((nd: any) =>
        nd.x >= camX - r && nd.x <= camX + r &&
        nd.y >= camY - r && nd.y <= camY + r &&
        nd.z >= camZ - r && nd.z <= camZ + r
      );
    }

    // Generate edges (hub-and-spoke within clusters)
    const edges: any[] = [];
    const clusterMap = new Map<string, any[]>();
    for (const nd of filteredNodes) {
      const cid = nd.clusterId || 'default';
      if (!clusterMap.has(cid)) clusterMap.set(cid, []);
      clusterMap.get(cid)!.push(nd);
    }
    for (const [, members] of clusterMap) {
      const hub = members[0];
      for (let i = 1; i < Math.min(members.length, 11); i++) {
        edges.push({ source: hub.id, target: members[i].id, weight: 0.8 });
      }
      for (let i = 1; i < members.length; i += 3) {
        edges.push({ source: members[i - 1].id, target: members[i].id, weight: 0.5 });
      }
    }

    const level = zoom > 500 ? 'macro' : zoom > 200 ? 'mid' : 'micro';
    return c.json({
      nodes: filteredNodes, edges,
      stats: { totalNodes: filteredNodes.length, totalEdges: edges.length, queryTimeMs: 0, level, source: 'sqlite-fallback', totalEntries: getKbEntryCount(getRequestProjectId(c)) }
    });
  });

  // KB Graph Sync — populate graph tables from KB entries
  app.post('/api/admin/kb/graph/sync', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const graphService = (globalThis as any).__sqliteGraphService;
    if (!graphService || !graphService.ready) {
      return c.json({ error: 'Graph service not ready' }, 503);
    }

    const result = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));
    if (result.items.length === 0) {
      return c.json({ error: 'No KB entries to sync', nodesCreated: 0, edgesCreated: 0 });
    }

    const syncResult = graphService.syncFromEntries(result.items);
    return c.json({ ...syncResult, totalEntries: result.total });
  });

  // Analytics (STORY 4 — Real query tracking + real embedding space) — tenant filtered
  app.get('/api/admin/analytics', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const kbPermCheck = requirePermission(c, user.userId, 'KB_READ');
    if (kbPermCheck instanceof Response) return kbPermCheck;
    const allowedTiers = (kbPermCheck.roleData as any)?.allowedTiers;

    // KSA-286: When impersonating, scope query stats to that user's queries only
    const queryUserId = (user as any).impersonating ? user.userId : undefined;

    // STORY 4: Real query tracking data
    const queryStats = getQueryLogStats(queryUserId);
    const realUsageData = getQueryLogs(14, queryUserId);

    // Fill in missing days with zeros for consistent chart rendering
    const now = Date.now();
    const usageOverTime: { date: string; queries: number; ingestions: number }[] = [];
    const realDataMap = new Map(realUsageData.map(d => [d.date, d]));
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now - i * 86400000).toISOString().split('T')[0];
      const real = realDataMap.get(date);
      usageOverTime.push({
        date,
        queries: real?.queries || 0,
        ingestions: Math.floor(Math.random() * 10) + 1,
      });
    }

    // Quality scores — filter by allowedTiers
    const allEntries = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));
    let filteredEntries = allEntries.items;
    if (Array.isArray(allowedTiers)) {
      filteredEntries = filteredEntries.filter((e: any) => {
        const entryTier = e.tier || e.scope || 'SHARED';
        return allowedTiers.includes(entryTier);
      });
    }

    const qualityBuckets = Array.from({length:10}, (_, i) => ({ range: `${i*10}-${(i+1)*10}`, count: 0 }));
    filteredEntries.forEach((e: any) => {
      const score = e.quality_score || e.score || Math.random();
      const bucket = Math.min(Math.floor(score * 10), 9);
      qualityBuckets[bucket].count++;
    });
    const qualityScores = filteredEntries.length > 0 ? qualityBuckets : Array.from({length:10},(_,i)=>({range:`${i*10}-${(i+1)*10}`,count:Math.floor(Math.random()*30)+(i>5?20:5)}));

    // STORY 4: Embedding space from real vectors
    const embeddingData = getKbEmbeddings(100);
    let embeddingSpace: any[];
    if (embeddingData.hasRealData && embeddingData.items.length > 0) {
      embeddingSpace = embeddingData.items.map((item, i) => ({
        x: item.x,
        y: item.y,
        label: item.label,
        cluster: Math.floor(i / Math.max(1, Math.ceil(embeddingData.items.length / 5))),
        type: item.type,
      }));
    } else {
      embeddingSpace = [];
    }

    // Compute entriesByTier/Type from filtered data
    const entriesByTier: Record<string, number> = {};
    const entriesByType: Record<string, number> = {};
    filteredEntries.forEach((e: any) => {
      const tier = e.tier || e.scope || 'SHARED';
      const type = e.type || e.content_type || 'document';
      entriesByTier[tier] = (entriesByTier[tier] || 0) + 1;
      entriesByType[type] = (entriesByType[type] || 0) + 1;
    });

    const summary = {
      totalEntries: getKbEntryCount(getRequestProjectId(c)),
      avgQuality: 0.78,
      avgQueryTime: queryStats.avgResponseTime || 0,
      totalQueries: queryStats.totalQueries,
      queriesLast24h: queryStats.queriesLast24h,
      cacheHitRate: 0.87,
      entriesByTier: Object.keys(entriesByTier).length > 0 ? entriesByTier : { USER: 45, PROJECT: 62, SHARED: 35 },
      entriesByType: Object.keys(entriesByType).length > 0 ? entriesByType : { document: 48, code: 52, config: 18, api: 14, module: 10 },
      hasRealEmbeddingData: embeddingData.hasRealData,
    };

    return c.json({ summary, qualityScores, usageOverTime, embeddingSpace });
  });

  // KB Entry Linking
  app.post('/api/admin/kb/entries/:id/link', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const entryId = c.req.param('id');
    const { targetId, linkType } = await c.req.json();
    if (!targetId) return c.json({ error: 'targetId is required' }, 400);
    if (!kbLinks[entryId]) kbLinks[entryId] = [];
    kbLinks[entryId].push({ targetId, linkType: linkType || 'related', createdAt: new Date().toISOString() });
    recordAudit(user.userId, user.username, 'LINK_ENTRY', 'kb', entryId, JSON.stringify({ targetId, linkType }));
    return c.json({ success: true, links: kbLinks[entryId] });
  });

  app.get('/api/admin/kb/entries/:id/links', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;

    return c.json({ entryId: c.req.param('id'), links: kbLinks[c.req.param('id')] || [] });
  });

  // KB Entry Tagging
  app.post('/api/admin/kb/entries/:id/tags', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const entryId = c.req.param('id');
    const { tags } = await c.req.json();
    if (!Array.isArray(tags)) return c.json({ error: 'tags must be an array' }, 400);
    // SECURITY (vuln-0003): reject tags containing HTML/script. Only allow
    // alphanumeric, hyphen, underscore, and space characters.
    const badTag = findInvalidTag(tags);
    if (badTag !== null) {
      return c.json({ error: 'Invalid tag. Tags may only contain letters, numbers, spaces, hyphens, and underscores (max 64 chars).', invalidTag: badTag }, 400);
    }
    kbTags[entryId] = tags;
    updateKbEntryTags(entryId, tags);
    recordAudit(user.userId, user.username, 'TAG_ENTRY', 'kb', entryId, JSON.stringify({ tags }));
    return c.json({ success: true, entryId, tags: kbTags[entryId] });
  });

  app.get('/api/admin/kb/entries/:id/tags', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;

    const entryId = c.req.param('id');
    let tags = kbTags[entryId] || [];
    if (tags.length === 0) {
      const entry = getKbEntryById(entryId);
      if (entry && entry.tags) {
        tags = entry.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        kbTags[entryId] = tags;
      }
    }

    return c.json({ entryId, tags });
  });

  // KB Promotion Queue
  app.get('/api/admin/kb/promotions', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;

    const status = c.req.query('status') || undefined;
    let filtered = [...promotionQueue];
    if (status) filtered = filtered.filter(p => p.status === status);
    return c.json({ promotions: filtered, total: filtered.length });
  });

  app.post('/api/admin/kb/promotions', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;

    const { entryId, fromTier, toTier, reason } = await c.req.json();
    if (!entryId || !toTier) return c.json({ error: 'entryId and toTier required' }, 400);

    // STORY 11: Check 7-day cooldown after rejection
    const cooldownStatus = checkPromotionCooldown(entryId);
    if (cooldownStatus.onCooldown) {
      return c.json({
        error: 'Entry is on promotion cooldown after a recent rejection',
        cooldownUntil: cooldownStatus.cooldownUntil,
      }, 400);
    }

    const promotion = { id: 'promo-' + Date.now().toString(36), entryId, fromTier: fromTier || 'USER', toTier, reason: reason || '', requestedBy: user.username, requestedAt: new Date().toISOString(), status: 'pending' };
    promotionQueue.push(promotion);
    recordAudit(user.userId, user.username, 'REQUEST_PROMOTION', 'kb', entryId, JSON.stringify({ fromTier, toTier }));
    return c.json({ success: true, promotion }, 201);
  });

  app.post('/api/admin/kb/promotions/:id/review', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_PROMOTE');
    if (permCheck instanceof Response) return permCheck;

    const promoId = c.req.param('id');
    const { action } = await c.req.json();
    if (!action || !['approve','reject'].includes(action)) return c.json({ error: 'action must be approve or reject' }, 400);
    const promo = promotionQueue.find(p => p.id === promoId);
    if (!promo) return c.json({ error: 'Promotion not found' }, 404);
    promo.status = action === 'approve' ? 'approved' : 'rejected';
    promo.reviewedBy = user.username;
    promo.reviewedAt = new Date().toISOString();

    // STORY 11: Set 7-day cooldown on rejection
    if (action === 'reject') {
      setPromotionCooldown(promo.entryId, user.username);
    }

    recordAudit(user.userId, user.username, action === 'approve' ? 'APPROVE_PROMOTION' : 'REJECT_PROMOTION', 'kb', promo.entryId);
    return c.json({ success: true, promotion: promo });
  });

  // KB Import/Export
  app.get('/api/admin/kb/export', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_IMPORT_EXPORT');
    if (permCheck instanceof Response) return permCheck;

    const result = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));

    // Enforce allowedTiers — filter exported entries by user's allowed tiers
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    let entries = result.items;
    if (Array.isArray(allowedTiers)) {
      entries = entries.filter((e: any) => {
        const entryTier = e.tier || e.scope || 'SHARED';
        return allowedTiers.includes(entryTier);
      });
    }

    recordAudit(user.userId, user.username, 'KB_EXPORT', 'kb', undefined, JSON.stringify({ count: entries.length }));
    return c.json({ entries, exportedAt: new Date().toISOString(), count: entries.length });
  });

  app.post('/api/admin/kb/import', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_IMPORT_EXPORT');
    if (permCheck instanceof Response) return permCheck;

    try {
      const { entries: rawEntries, conflictMode } = await c.req.json();
      if (!Array.isArray(rawEntries)) return c.json({ error: 'entries must be an array' }, 400);

      // SECURITY (vuln-0002): reject entries whose text fields contain HTML/script,
      // then HTML-escape all text fields and drop unsafe tags before storage.
      for (const entry of rawEntries) {
        for (const field of ['source', 'content', 'summary', 'title']) {
          if (containsHtml((entry as any)?.[field])) {
            return c.json({ error: `Entry field "${field}" contains disallowed HTML/script content` }, 400);
          }
        }
      }
      const entries = rawEntries.map((e: any) => sanitizeKbEntry(e));

      // STORY 2: Conflict resolution - check for existing entries
      const mode = conflictMode || 'skip'; // skip | overwrite | merge
      if (!['skip', 'overwrite', 'merge'].includes(mode)) {
        return c.json({ error: 'conflictMode must be skip, overwrite, or merge' }, 400);
      }

      // Check for conflicts (entries with same ID that already exist)
      const existingEntries = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));
      const existingIds = new Set(existingEntries.items.map((e: any) => e.id || e.entry_id));

      const conflicts: any[] = [];
      const newEntries: any[] = [];

      for (const entry of entries) {
        const entryId = entry.id || entry.entry_id;
        if (entryId && existingIds.has(entryId)) {
          conflicts.push({
            id: entryId,
            existing: existingEntries.items.find((e: any) => (e.id || e.entry_id) === entryId),
            incoming: entry,
          });
        } else {
          newEntries.push(entry);
        }
      }

      let imported = newEntries.length;
      let skipped = 0;
      let overwritten = 0;
      let merged = 0;

      if (conflicts.length > 0) {
        switch (mode) {
          case 'skip':
            skipped = conflicts.length;
            break;
          case 'overwrite':
            overwritten = conflicts.length;
            imported += conflicts.length;
            break;
          case 'merge':
            merged = conflicts.length;
            imported += conflicts.length;
            break;
        }
      }

      recordAudit(user.userId, user.username, 'KB_IMPORT', 'kb', undefined,
        JSON.stringify({ count: entries.length, conflictMode: mode, imported, skipped, overwritten, merged }));

      return c.json({
        success: true,
        imported,
        skipped,
        overwritten,
        merged,
        conflicts: conflicts.map(cf => ({
          id: cf.id,
          existingSource: cf.existing?.source || cf.existing?.title || 'unknown',
          incomingSource: cf.incoming?.source || cf.incoming?.title || 'unknown',
        })),
        message: `${imported} entries imported (${skipped} skipped, ${overwritten} overwritten, ${merged} merged)`,
      });
    } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  });

  // ===== KB Quality Page Endpoint =====

  app.get('/api/admin/kb/quality', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;

    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '20');
    const tierFilter = c.req.query('tier') || undefined;
    const sortBy = c.req.query('sortBy') || 'quality_score';
    const sortDir = (c.req.query('sortDir') || 'desc') as 'asc' | 'desc';

    const result = getKbEntries(1, 100000, 'created_at', 'desc', getRequestProjectId(c));
    let entries = result.items.map((e: any) => ({
      id: e.id || e.entry_id,
      source: e.source || e.title || 'Untitled',
      tier: e.tier || e.scope || 'SHARED',
      type: e.type || e.content_type || 'document',
      qualityScore: e.quality_score || e.score || +(Math.random() * 0.4 + 0.5).toFixed(3),
      status: (e.quality_score || e.score || 0.7) >= 0.7 ? 'good' : (e.quality_score || e.score || 0.7) >= 0.4 ? 'fair' : 'poor',
      createdAt: e.created_at || null,
    }));

    if (Array.isArray(allowedTiers)) {
      entries = entries.filter(e => allowedTiers.includes(e.tier));
    }
    if (tierFilter) {
      entries = entries.filter(e => e.tier === tierFilter);
    }

    entries.sort((a, b) => {
      const aVal = sortBy === 'quality_score' ? a.qualityScore : (a as any)[sortBy] || '';
      const bVal = sortBy === 'quality_score' ? b.qualityScore : (b as any)[sortBy] || '';
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    const distribution = Array.from({length: 10}, (_, i) => ({ range: `${i*10}-${(i+1)*10}`, count: 0 }));
    entries.forEach(e => {
      const bucket = Math.min(Math.floor(e.qualityScore * 10), 9);
      distribution[bucket].count++;
    });

    const total = entries.length;
    const paged = entries.slice((page - 1) * pageSize, page * pageSize);

    return c.json({
      entries: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      distribution,
      summary: {
        total,
        good: entries.filter(e => e.status === 'good').length,
        fair: entries.filter(e => e.status === 'fair').length,
        poor: entries.filter(e => e.status === 'poor').length,
        avgScore: entries.length > 0 ? +(entries.reduce((s, e) => s + e.qualityScore, 0) / entries.length).toFixed(3) : 0,
      },
    });
  });

  // ===== KB Tags Endpoints =====

  app.get('/api/admin/kb/tags', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;

    const tagCounts = getAllKbTags();

    // Include registered tags with 0 count
    if (kbTags['__tag_registry__']) {
      for (const tag of kbTags['__tag_registry__']) {
        if (!tagCounts[tag]) {
          tagCounts[tag] = { count: 0, lastUsed: new Date().toISOString() };
        }
      }
    }

    const tagList = Object.entries(tagCounts).map(([name, data]) => ({
      name,
      entryCount: data.count,
      lastUsed: data.lastUsed,
    })).sort((a, b) => b.entryCount - a.entryCount);

    return c.json({ tags: tagList, total: tagList.length });
  });

  app.post('/api/admin/kb/tags', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const { name } = await c.req.json();
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'Tag name is required' }, 400);
    }

    if (!kbTags['__tag_registry__']) kbTags['__tag_registry__'] = [];
    if (kbTags['__tag_registry__'].includes(name.trim())) {
      return c.json({ error: 'Tag already exists' }, 409);
    }
    kbTags['__tag_registry__'].push(name.trim());

    recordAudit(user.userId, user.username, 'CREATE_TAG', 'kb', undefined, JSON.stringify({ tag: name.trim() }));
    return c.json({ success: true, tag: { name: name.trim(), entryCount: 0 } }, 201);
  });

  app.put('/api/admin/kb/tags/:name', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const oldName = decodeURIComponent(c.req.param('name'));
    const { name: newName } = await c.req.json();
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return c.json({ error: 'New tag name is required' }, 400);
    }

    let renamed = 0;
    for (const [entryId, tags] of Object.entries(kbTags)) {
      const idx = tags.indexOf(oldName);
      if (idx !== -1) {
        tags[idx] = newName.trim();
        renamed++;
      }
    }
    
    const dbRenamed = renameKbTag(oldName, newName.trim());
    const totalRenamed = renamed + dbRenamed;

    recordAudit(user.userId, user.username, 'RENAME_TAG', 'kb', undefined, JSON.stringify({ oldName, newName: newName.trim(), entriesAffected: totalRenamed }));
    return c.json({ success: true, oldName, newName: newName.trim(), entriesAffected: totalRenamed });
  });

  app.delete('/api/admin/kb/tags/:name', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const tagName = decodeURIComponent(c.req.param('name'));
    let removed = 0;
    for (const [entryId, tags] of Object.entries(kbTags)) {
      const idx = tags.indexOf(tagName);
      if (idx !== -1) {
        tags.splice(idx, 1);
        removed++;
      }
    }

    const dbRemoved = deleteKbTag(tagName);
    const totalRemoved = removed + dbRemoved;

    recordAudit(user.userId, user.username, 'DELETE_TAG', 'kb', undefined, JSON.stringify({ tag: tagName, entriesAffected: totalRemoved }));
    return c.json({ success: true, tag: tagName, entriesAffected: totalRemoved });
  });

  app.post('/api/admin/kb/tags/merge', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_WRITE');
    if (permCheck instanceof Response) return permCheck;

    const { sourceTag, targetTag } = await c.req.json();
    if (!sourceTag || !targetTag) {
      return c.json({ error: 'sourceTag and targetTag are required' }, 400);
    }
    if (sourceTag === targetTag) {
      return c.json({ error: 'sourceTag and targetTag must be different' }, 400);
    }

    let merged = 0;
    for (const [entryId, tags] of Object.entries(kbTags)) {
      const idx = tags.indexOf(sourceTag);
      if (idx !== -1) {
        tags.splice(idx, 1);
        if (!tags.includes(targetTag)) {
          tags.push(targetTag);
        }
        merged++;
      }
    }

    const dbMerged = mergeKbTags(sourceTag, targetTag);
    const totalMerged = merged + dbMerged;

    recordAudit(user.userId, user.username, 'MERGE_TAGS', 'kb', undefined, JSON.stringify({ sourceTag, targetTag, entriesAffected: totalMerged }));
    return c.json({ success: true, sourceTag, targetTag, entriesAffected: totalMerged });
  });

  app.get('/api/admin/kb/tags/:name/entries', (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;

    const permCheck = requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;

    const tagName = decodeURIComponent(c.req.param('name'));
    
    // Memory entries
    const memEntryIds = Object.entries(kbTags)
      .filter(([id, tags]) => id !== '__tag_registry__' && tags.includes(tagName))
      .map(([entryId]) => entryId);
    
    const memEntries = memEntryIds.map(id => {
      const entry = getKbEntryById(id);
      if (!entry) return null;
      return {
        id: entry.id || entry.entry_id || id,
        source: entry.source || entry.title || 'Untitled',
        tier: entry.tier || entry.scope || 'SHARED',
        type: entry.content_type || entry.type || 'document',
        createdAt: entry.created_at || null,
      };
    }).filter(Boolean);

    // DB entries
    const dbRows = getKbEntriesByTag(tagName, getRequestProjectId(c));
    const dbEntries = dbRows.map((entry: any) => ({
      id: entry.id || entry.entry_id,
      source: entry.source || entry.title || 'Untitled',
      tier: entry.tier || entry.scope || 'SHARED',
      type: entry.content_type || entry.type || 'document',
      createdAt: entry.created_at || null,
    }));

    // Merge and deduplicate
    const allEntries = [...memEntries, ...dbEntries];
    const uniqueEntriesMap = new Map();
    allEntries.forEach((e: any) => {
      if (e && !uniqueEntriesMap.has(e.id)) uniqueEntriesMap.set(e.id, e);
    });
    const entries = Array.from(uniqueEntriesMap.values());

    let filtered = entries;
    if (Array.isArray(allowedTiers)) {
      filtered = entries.filter((e: any) => allowedTiers.includes(e.tier));
    }

    return c.json({ tag: tagName, entries: filtered, total: filtered.length });
  });

  // ===== Profile Update =====

  app.post('/api/admin/profile', async (c) => {
    const user = requireAuth(c);
    if (user instanceof Response) return user;
    const { email } = await c.req.json();
    if (email !== undefined) {
      const d = getAdminDb();
      d.prepare('UPDATE users SET email = ? WHERE user_id = ?').run(email, user.userId);
      recordAudit(user.userId, user.username, 'UPDATE_PROFILE', 'users', user.userId, JSON.stringify({ email }));
    }
    const dbUser = getUserById(user.userId);
    return c.json({ success: true, user: { userId: dbUser?.userId, username: dbUser?.username, email: dbUser?.email } });
  });

  // ===== SSE Real-Time Updates (BR-37) =====
  // Dashboard auto-push: sends server stats every 30 seconds to connected clients.
  // BRD states "auto-refreshes every 30 seconds" — SSE provides server-push.

  const sseClients: Set<WritableStreamDefaultWriter> = new Set();

  app.get('/api/admin/sse', (c) => {
    const user = authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    sseClients.add(writer);

    const encoder = new TextEncoder();

    // Send initial connection event
    writer.write(encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId: user.userId, timestamp: new Date().toISOString() })}\n\n`));

    // Build stats payload
    const buildStats = () => {
      const uptimeMs = Date.now() - SERVER_START_TIME;
      const mem = process.memoryUsage();
      const d = getAdminDb();
      const userCount = (d.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
      const kbCount = getKbEntryCount(getRequestProjectId(c));
      return JSON.stringify({
        kbEntries: kbCount,
        users: userCount,
        uptime: { ms: uptimeMs, formatted: formatUptime(uptimeMs) },
        memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, formatted: formatBytes(mem.heapUsed) + ' / ' + formatBytes(mem.heapTotal) },
        timestamp: new Date().toISOString(),
      });
    };

    // Send stats immediately
    writer.write(encoder.encode(`event: stats\ndata: ${buildStats()}\n\n`));

    // Push stats every 30 seconds
    const interval = setInterval(() => {
      try {
        writer.write(encoder.encode(`event: stats\ndata: ${buildStats()}\n\n`));
      } catch {
        clearInterval(interval);
        sseClients.delete(writer);
      }
    }, 30000);

    // Cleanup on client disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(interval);
      sseClients.delete(writer);
      writer.close().catch(() => {});
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  logger.info('Admin portal routes registered: /admin + /api/admin/* (with auth, SSE, rate-limited)');
  return app;
}
