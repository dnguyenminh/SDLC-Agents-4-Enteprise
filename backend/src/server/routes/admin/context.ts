/**
 * context.ts — AdminContext factory for admin route handlers.
 * SA4E-50: authenticate/requireAuth are now async because validateSession,
 * getUserPermissions, and getUserById all return Promise<T>.
 */

import type { Logger } from 'pino';
import {
  validateSession,
  getUserPermissions,
  getUserById,
} from '../../../admin/admin-db.js';
import { loadConfig } from '../../../config/index.js';
import { DatabaseManager } from '../../../database/DatabaseManager.js';
import { getAdminAdapter, getIndexAdapter } from '../../../admin/db/core.js';

export interface AdminContext {
  logger: Logger;
  registry?: any;
  /** SA4E-50: Typed repository access via DatabaseManager facade. */
  db: DatabaseManager;
  authenticate: (c: any) => Promise<any>;
  requireAuth: (c: any) => Promise<any>;
  checkPermission: (userId: string, requiredPermission: string) => Promise<{ has: boolean; roleData: Record<string, unknown> }>;
  requirePermission: (c: any, userId: string, requiredPermission: string) => Promise<any>;
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
  const checkPermission = async (
    userId: string,
    requiredPermission: string,
  ): Promise<{ has: boolean; roleData: Record<string, unknown> }> => {
    const permissions = await getUserPermissions(userId);
    const perm = permissions.find(p => p.permissionId === requiredPermission);
    if (!perm) return { has: false, roleData: {} };
    return { has: true, roleData: perm.roleData };
  };

  const authenticate = async (c: any): Promise<any> => {
    const auth = c.req.header('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return null;
    const session = await validateSession(token);
    if (!session) return null;

    const impersonateId = c.req.header('X-Impersonate') || '';
    if (impersonateId && impersonateId !== session.userId) {
      const { has } = await checkPermission(session.userId, 'RBAC_MANAGE');
      if (has) {
        const target = await getUserById(impersonateId);
        if (target) {
          return { userId: target.userId, username: target.username, accessGroupId: target.accessGroupId, impersonating: true };
        }
      }
    }
    return session;
  };

  const requireAuth = async (c: any): Promise<any> => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return user;
  };

  const requirePermission = async (
    c: any,
    userId: string,
    requiredPermission: string,
  ): Promise<any> => {
    const { has, roleData } = await checkPermission(userId, requiredPermission);
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

  // SA4E-50: Wire DatabaseManager with pre-resolved adapters
  const db = DatabaseManager.createDefault(getAdminAdapter(), getIndexAdapter());

  return {
    logger,
    registry,
    db,
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
