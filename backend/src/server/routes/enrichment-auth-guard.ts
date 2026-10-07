/**
 * SA4E-338 S1 — Identity & permission guard for enrichment retry/reconcile/failures routes.
 * Implements TDD §7.1: D-SEC-01 (admin permission gate), D-SEC-03 (JWT `pid` scope —
 * the client header `X-Project-Id` is IGNORED on these routes).
 *
 * Fail-closed contract:
 * - missing / invalid token            → 401 (defense-in-depth; the server also mounts
 *   `jwtAuthStrict` on `/api/v1/*` at HttpServer.ts:112-118)
 * - valid token without `pid` claim    → 403
 * - missing required permission or permission-lookup error → 403
 */

import type { Context } from 'hono';
import type { Logger } from 'pino';
import { verifyJwtToken } from '../middleware/jwt-auth.js';
import { getUserPermissions } from '../../admin/admin-db.js';

/** Admin-level permission per TDD §7.1 (`['ADMIN','CONFIG_EDIT']`; the seeded
 *  `grp-admin` group holds CONFIG_EDIT — see admin/db/schema.ts:302). */
const REQUIRED_PERMISSIONS = ['ADMIN', 'CONFIG_EDIT'];

/** Identity resolved from a verified JWT (D-SEC-03). */
export interface EnrichmentIdentity {
  userId: string;
  username: string;
  projectId: string;
}

export type IdentityResult =
  | { ok: true; identity: EnrichmentIdentity }
  | { ok: false; status: 401 | 403; code: string; message: string };

/**
 * Resolve the caller identity from the Bearer JWT only (signature + expiry verified).
 * `X-Project-Id` is deliberately NOT consulted (D-SEC-03).
 */
export async function resolveJwtIdentity(c: Context): Promise<IdentityResult> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, code: 'AUTH_REQUIRED', message: 'Authentication required' };
  const { valid, payload } = await verifyJwtToken(token);
  if (!valid || !payload) return { ok: false, status: 401, code: 'TOKEN_INVALID', message: 'Invalid or expired token' };
  const projectId = typeof payload.pid === 'string' ? payload.pid.trim() : '';
  if (!projectId) {
    return { ok: false, status: 403, code: 'PROJECT_SCOPE_REQUIRED', message: 'JWT project claim (pid) is required for this endpoint' };
  }
  const userId = typeof payload.sub === 'string' ? payload.sub : '';
  const username = typeof payload.username === 'string' ? payload.username : userId;
  return { ok: true, identity: { userId, username, projectId } };
}

/** Permission gate (D-SEC-01): ADMIN or CONFIG_EDIT; DB lookup errors deny. */
export async function requireEnrichmentAdmin(c: Context, userId: string, logger: Logger): Promise<Response | null> {
  try {
    const perms = await getUserPermissions(userId);
    if (perms.some((p) => REQUIRED_PERMISSIONS.includes(p.permissionId))) return null;
    logger.warn({ userId }, '[EnrichmentAuth] missing CONFIG_EDIT permission — rejected');
    return c.json({ error: 'Forbidden', details: 'Missing required permission: CONFIG_EDIT' }, 403);
  } catch (err) {
    logger.warn({ err, userId }, '[EnrichmentAuth] permission lookup failed — denying');
    return c.json({ error: 'Forbidden', details: 'Unable to verify permissions' }, 403);
  }
}

/** Render an identity failure as a JSON response (401/403). */
export function identityDenied(c: Context, denied: Extract<IdentityResult, { ok: false }>): Response {
  return c.json({ data: null, error: { code: denied.code, message: denied.message } }, denied.status);
}
