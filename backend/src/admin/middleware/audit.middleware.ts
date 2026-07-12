// KSA-286: Audit Middleware — Records every admin action after handler completes

import { Request, Response, NextFunction } from 'express';

export interface AuditDeps {
  recordAudit: (entry: {
    userId: string;
    username: string;
    action: string;
    resource: string;
    resourceId?: string;
    changes?: any;
    ipAddress?: string;
  }) => Promise<void>;
}

function deriveAction(method: string, path: string): string {
  if (path.includes('force-logout')) return 'USER_FORCE_LOGOUT';
  if (path.includes('reset-password')) return 'USER_UPDATED';
  if (path.includes('status') && method === 'PATCH') return 'USER_DISABLED';
  if (path.includes('promotion/review')) return 'KB_ENTRY_PROMOTED';
  if (path.includes('/links') && method === 'POST') return 'KB_LINKED';
  if (path.includes('/links') && method === 'DELETE') return 'KB_UNLINKED';
  if (path.includes('/tags')) return 'KB_TAGS_UPDATED';
  if (path.includes('/restart')) return 'SERVER_RESTARTED';
  if (path.includes('/tools/') && method === 'PATCH') return 'TOOL_DISABLED';
  if (path.includes('/import')) return 'KB_IMPORTED';
  if (path.includes('/config') && method === 'PATCH') return 'CONFIG_UPDATED';

  const resource = path.split('/').filter(Boolean)[2] || 'unknown';
  const map: Record<string, Record<string, string>> = {
    users: { POST: 'USER_CREATED', PATCH: 'USER_UPDATED', DELETE: 'USER_DELETED' },
    rbac: { POST: 'GROUP_CREATED', PUT: 'GROUP_UPDATED', DELETE: 'GROUP_DELETED' },
  };
  return map[resource]?.[method] || `${method}_${resource.toUpperCase()}`;
}

export function createAuditMiddleware(deps: AuditDeps) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') { next(); return; }

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const userId = (req as { userId: string }).userId;
      const username = (req as { username: string }).username || 'unknown';
      if (userId && res.statusCode < 500) {
        deps.recordAudit({
          userId, username,
          action: deriveAction(req.method, req.baseUrl + req.path),
          resource: (req.baseUrl + req.path).split('/').filter(Boolean)[2] || 'unknown',
          resourceId: (req.params.id || req.params.userId) as string | undefined,
          changes: req.body ? { after: req.body } : undefined,
          ipAddress: (Array.isArray(req.ip) ? req.ip[0] : req.ip) || req.socket.remoteAddress,
        }).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}
