import type { Logger } from 'pino';
import {
  validateSession,
  getUserPermissions,
  getUserById,
} from '../../../admin/admin-db.js';
import { loadConfig } from '../../../config/index.js';

export interface AdminContext {
  logger: Logger;
  registry?: any;
  authenticate: (c: any) => any;
  requireAuth: (c: any) => any;
  checkPermission: (userId: string, requiredPermission: string) => { has: boolean; roleData: Record<string, unknown> };
  requirePermission: (c: any, userId: string, requiredPermission: string) => any;
  getRequestProjectId: (c: any) => string;
  mcpServerLogs: Record<string, any[]>;
  toolToggles: Record<string, Record<string, boolean>>;
  configOverrides: Record<string, Record<string, any>>;
  RESTART_REQUIRED_KEYS: Record<string, string[]>;
  kbLinks: Record<string, any[]>;
  kbTags: Record<string, string[]>;
  promotionQueue: any[];
  sseClients: Set<any>;
  SERVER_START_TIME: number;
}

export function createAdminContext(logger: Logger, registry?: any): AdminContext {
  const checkPermission = (userId: string, requiredPermission: string) => {
    const permissions = getUserPermissions(userId);
    const perm = permissions.find(p => p.permissionId === requiredPermission);
    if (!perm) return { has: false, roleData: {} };
    return { has: true, roleData: perm.roleData };
  };

  const authenticate = (c: any) => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return null;
    const session = validateSession(token);
    if (!session) return null;
    const impersonateId = c.req.header('X-Impersonate') || '';
    if (impersonateId && impersonateId !== session.userId) {
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

  const requireAuth = (c: any) => {
    const user = authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return user;
  };

  const requirePermission = (c: any, userId: string, requiredPermission: string) => {
    const { has, roleData } = checkPermission(userId, requiredPermission);
    if (!has) return c.json({ error: 'Forbidden: missing permission ' + requiredPermission }, 403);
    return { roleData };
  };

  const getRequestProjectId = (c: any): string => {
    const headerProjectId = c.req.header('X-Project-Id');
    if (headerProjectId) return headerProjectId;
    const queryProjectId = c.req.query('projectId');
    if (queryProjectId) return queryProjectId;
    return loadConfig().projectId;
  };

  return {
    logger,
    registry,
    authenticate,
    requireAuth,
    checkPermission,
    requirePermission,
    getRequestProjectId,
    mcpServerLogs: {},
    toolToggles: {},
    configOverrides: {},
    RESTART_REQUIRED_KEYS: {
      server: ['port', 'host'],
      embedding: ['model', 'dimensions'],
      llm: ['provider', 'baseUrl'],
    },
    kbLinks: {},
    kbTags: {},
    promotionQueue: [],
    sseClients: new Set(),
    SERVER_START_TIME: Date.now(),
  };
}
