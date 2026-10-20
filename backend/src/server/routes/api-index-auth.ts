/**
 * Index route auth/RBAC gates — extracted from api-index.ts (BR-18).
 * SA4E-300 SEC High #1 (BOLA) + High #2 (RBAC) with a short-TTL permission cache.
 */
import type { Context } from 'hono';
import type { Logger } from 'pino';
import { validateSession } from '../../admin/db/sessions.js';
import { getUserPermissions } from '../../admin/admin-db.js';
import { verifyJwtToken, allowedProjectsFromClaims } from '../middleware/jwt-auth.js';

/** Require valid session — returns 401 if not authenticated. */
export async function requireAuth(c: Context): Promise<{ userId: string } | null> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const session = await validateSession(token);
  return session ?? null;
}

/**
 * SA4E-300 SEC High #1 perf: short-TTL per-user permission cache. Sequential
 * batch uploaders re-check the SAME user on every batch (915 batches ≈ 915
 * identical queries through the shared PG pool — a proven 429 amplifier on
 * cloud where pool waits stretch handler duration). Only SUCCESSFUL lookups
 * are cached — DB errors are never cached (fail-closed preserved). Tradeoff:
 * a permission revocation lands on index routes within ≤10s (same order as
 * the session cache in admin/db/sessions.ts).
 */
const PERMISSION_CACHE_TTL_MS = 10_000;
interface CachedPermissions { perms: Array<{ permissionId: string }>; expiresAt: number }
const permissionCache = new Map<string, CachedPermissions>();

async function getCachedUserPermissions(userId: string): Promise<Array<{ permissionId: string }>> {
  const now = Date.now();
  const cached = permissionCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.perms;
  const perms = (await getUserPermissions(userId)) as Array<{ permissionId: string }>;
  permissionCache.set(userId, { perms, expiresAt: now + PERMISSION_CACHE_TTL_MS });
  // Bound memory: sweep expired entries past a high-water mark (no timer leak).
  if (permissionCache.size > 1000) {
    for (const [key, entry] of permissionCache) {
      if (entry.expiresAt <= now) permissionCache.delete(key);
    }
  }
  return perms;
}

/** Test/maintenance hook: drop all cached permission entries. */
export function clearIndexPermissionCache(): void {
  permissionCache.clear();
}

/**
 * SA4E-300 SEC High #1 (BOLA) + High #2 (missing RBAC on sync-pega-rules).
 * Authorization gates reusing EXISTING infra only (no new framework):
 * - Global RBAC via getUserPermissions — same source as AdminContext.requirePermission
 *   (server/routes/admin/context.ts); permission IDs from admin types: KB_WRITE is the
 *   gate used by all KB write routes (kb-tags.ts, kb-operations.ts), GRAPH_MAINTAIN is
 *   the gate used by populate-edges (admin/kb-graph.ts:104).
 * - Tenant binding via verifyJwtToken + allowedProjectsFromClaims — same pattern as
 *   verifyProjectBinding SEC-03 (server/routes/tools.ts): when the caller presents a
 *   valid JWT carrying pid/pids grants, the requested project must be inside the grant.
 * NOTE (fallback, PO risk-accept): there is NO project-membership table for opaque
 * admin session tokens (users ↔ access_groups only), so session principals cannot be
 * bound per-project. For them the global permission gate below is the enforced
 * boundary; cross-project writes by a permissioned session user remain possible and
 * must be risk-accepted or closed by adding per-project membership later.
 * Returns a 403 JSON response when denied, or null when allowed.
 */
export async function requireIndexPermission(
  c: Context, userId: string, permissionId: string, logger: Logger,
): Promise<Response | null> {
  let has = false;
  try {
    const perms = await getCachedUserPermissions(userId);
    has = perms.some((p: any) => p.permissionId === permissionId);
  } catch (err) {
    // Fail closed: DB error must not grant access.
    logger.warn({ err, userId, permissionId }, '[index] permission lookup failed — denying');
    return c.json({ error: 'Forbidden', details: 'Unable to verify permissions', action: 'Retry or contact an administrator' }, 403);
  }
  if (!has) {
    logger.warn({ userId, permissionId }, '[index] missing required permission — rejected');
    return c.json({ error: 'Forbidden', details: `Missing required permission: ${permissionId}`, action: 'Contact an administrator to grant access' }, 403);
  }
  return null;
}

/**
 * SA4E-300 SEC High #1 (BOLA): bind the requested projectId to the caller's JWT
 * project grants (tools.ts SEC-03 pattern). Opaque session tokens carry no
 * per-project grant → allowed here (global permission gate still applies, see above).
 * Returns a 403 JSON response when the project is outside the grant, else null.
 */
export async function verifyIndexProjectBinding(
  c: Context, projectId: string, logger: Logger,
): Promise<Response | null> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const { valid, payload } = await verifyJwtToken(token);
  if (!valid || !payload) return null; // opaque/admin-session token → no per-tenant grant
  const granted = allowedProjectsFromClaims(payload);
  if (granted.length === 0) return null; // JWT without project claim → no grant to enforce
  if (projectId && !granted.includes(projectId)) {
    logger.warn({ projectId, sub: (payload as any)?.sub }, '[index] project outside principal grant — rejected');
    return c.json({ error: 'Forbidden', details: `No access to project '${projectId}'`, action: 'Use an authorized project' }, 403);
  }
  return null;
}
