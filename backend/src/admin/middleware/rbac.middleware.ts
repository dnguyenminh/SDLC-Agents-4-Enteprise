// KSA-286: RBAC Middleware — Permission enforcement on every /api/admin/* request

import { Request, Response, NextFunction } from 'express';
import { PermissionId, AdminErrorCode, GroupPermission } from '../types/admin.types.js';

// Route → Permission mapping
const ROUTE_PERMISSIONS: Record<string, PermissionId> = {
  'GET:/api/admin/dashboard/health': 'DASHBOARD_VIEW',
  'GET:/api/admin/dashboard/activity': 'DASHBOARD_VIEW',
  'GET:/api/admin/kb/entries': 'KB_READ',
  'POST:/api/admin/kb/entries/*/links': 'KB_WRITE',
  'DELETE:/api/admin/kb/entries/*/links/*': 'KB_WRITE',
  'PATCH:/api/admin/kb/entries/*/tags': 'KB_WRITE',
  'GET:/api/admin/kb/promotion': 'KB_PROMOTE',
  'POST:/api/admin/kb/promotion/review': 'KB_PROMOTE',
  'POST:/api/admin/kb/import': 'KB_IMPORT_EXPORT',
  'GET:/api/admin/kb/export': 'KB_IMPORT_EXPORT',
  'GET:/api/admin/kb/graph': 'GRAPH_VIEW',
  'GET:/api/admin/mcp/servers': 'MCP_ACCESS',
  'POST:/api/admin/mcp/servers/*/restart': 'MCP_MANAGE',
  'PATCH:/api/admin/mcp/servers/*/tools/*': 'MCP_MANAGE',
  'GET:/api/admin/users': 'USER_MANAGE',
  'POST:/api/admin/users': 'USER_MANAGE',
  'PATCH:/api/admin/users/*': 'USER_MANAGE',
  'DELETE:/api/admin/users/*': 'USER_MANAGE',
  'POST:/api/admin/users/*/force-logout': 'USER_MANAGE',
  'POST:/api/admin/users/*/reset-password': 'USER_MANAGE',
  'GET:/api/admin/rbac/groups': 'RBAC_MANAGE',
  'POST:/api/admin/rbac/groups': 'RBAC_MANAGE',
  'PUT:/api/admin/rbac/groups/*': 'RBAC_MANAGE',
  'DELETE:/api/admin/rbac/groups/*': 'RBAC_MANAGE',
  'GET:/api/admin/rbac/permissions': 'RBAC_MANAGE',
  'GET:/api/admin/config': 'CONFIG_EDIT',
  'PATCH:/api/admin/config/*/*': 'CONFIG_EDIT',
  'POST:/api/admin/search/explore': 'SEARCH_EXPLORE',
  'GET:/api/admin/audit': 'AUDIT_VIEW',
  'GET:/api/admin/audit/export': 'AUDIT_VIEW',
  'GET:/api/admin/analytics/overview': 'ANALYTICS_VIEW',
  'GET:/api/admin/analytics/embeddings': 'ANALYTICS_VIEW',
};

// roleData validators
const ROLE_DATA_VALIDATORS: Partial<Record<PermissionId, (req: Request, rd: Record<string, any>) => boolean>> = {
  KB_READ: (req, rd) => !rd.tiers?.length || !req.query.tier || rd.tiers.includes(req.query.tier),
  KB_WRITE: (req, rd) => !rd.tiers?.length || !req.body?.tier || rd.tiers.includes(req.body.tier),
  MCP_ACCESS: (req, rd) => !rd.mcpServers?.length || !req.params.id || rd.mcpServers.includes(req.params.id),
  MCP_MANAGE: (req, rd) => !rd.mcpServers?.length || !req.params.id || rd.mcpServers.includes(req.params.id),
  CONFIG_EDIT: (req, rd) => !rd.sections?.length || !req.params.section || rd.sections.includes(req.params.section),
  AUDIT_VIEW: (req, rd) => !req.path.includes('/export') || rd.exportAllowed !== false,
  USER_MANAGE: (req, rd) => req.method !== 'DELETE' || rd.canDelete !== false,
};

// Permission cache
const permissionCache = new Map<string, { permissions: GroupPermission[]; cachedAt: number }>();

export function invalidateRBACCache(userId?: string): void {
  if (userId) permissionCache.delete(userId);
  else permissionCache.clear();
}

function matchRoute(method: string, path: string): PermissionId | undefined {
  const key = `${method}:${path}`;
  if (ROUTE_PERMISSIONS[key]) return ROUTE_PERMISSIONS[key];

  // Wildcard matching
  const segments = path.split('/');
  for (let i = segments.length - 1; i >= 3; i--) {
    const pattern = [...segments.slice(0, i), '*', ...segments.slice(i + 1)].join('/');
    if (ROUTE_PERMISSIONS[`${method}:${pattern}`]) return ROUTE_PERMISSIONS[`${method}:${pattern}`];
  }
  return undefined;
}

export interface RBACDeps {
  getUserPermissions: (userId: string) => Promise<GroupPermission[] | null>;
  getUserStatus: (userId: string) => Promise<string | null>;
}

export function createRBACMiddleware(deps: RBACDeps) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as { userId: string }).userId;
    if (!userId) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } }); return; }

    const status = await deps.getUserStatus(userId);
    if (status !== 'ACTIVE') { res.status(403).json({ success: false, error: { code: 'USER_DISABLED', message: 'Account disabled' } }); return; }

    const required = matchRoute(req.method, req.baseUrl + req.path);
    if (!required) { next(); return; }

    let cached = permissionCache.get(userId);
    if (!cached || Date.now() - cached.cachedAt > 60000) {
      const perms = await deps.getUserPermissions(userId);
      if (!perms) { res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'No group' } }); return; }
      cached = { permissions: perms, cachedAt: Date.now() };
      permissionCache.set(userId, cached);
    }

    const matched = cached.permissions.find(p => p.permissionId === required);
    if (!matched) {
      res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: `Requires: ${required}` } });
      return;
    }

    const validator = ROLE_DATA_VALIDATORS[required];
    if (validator && matched.roleData && Object.keys(matched.roleData).length > 0) {
      if (!validator(req, matched.roleData)) {
        res.status(403).json({ success: false, error: { code: 'ROLE_DATA_DENIED', message: 'roleData restricts action' } });
        return;
      }
    }

    (req as { userPermissions: GroupPermission[] }).userPermissions = cached.permissions;
    next();
  };
}

