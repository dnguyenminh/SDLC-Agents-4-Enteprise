/**
 * SA4E-338 S1 — Identity & permission guard for enrichment retry/reconcile/failures routes.
 * Implements TDD §7.1: D-SEC-01 (admin permission gate).
 *
 * Project scope (SA4E-338 rev B): the login JWT is user-scoped and carries no `pid`
 * claim (session-issue.ts / session-types.ts sign only `sub`+`sid`), so project
 * identity flows through the `X-Project-Id` header — the same channel every other
 * authenticated extension call uses (IndexerHttpClient.buildHeaders, GET
 * /enrichment/status). The JWT supplies IDENTITY (userId/username) only; the header
 * supplies SCOPE. Targeting a project the caller does not own is still bounded by the
 * `CONFIG_EDIT` permission gate + rate limiter, and the project id is a
 * workspace-derived identifier, not a secret.
 *
 * Fail-closed contract:
 * - missing / invalid token            → 401 (defense-in-depth; the server also mounts
 *   `jwtAuthStrict` on `/api/v1/*` at HttpServer.ts:112-118)
 * - missing `X-Project-Id` header      → 403 (no implicit "all projects" mutation)
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
 * Resolve the caller identity (from the verified Bearer JWT) and project scope
 * (from the `X-Project-Id` header). The JWT's signature + expiry are verified for
 * identity; the header supplies the project to act on (SA4E-338 rev B). A JWT `pid`
 * claim, if present, is used only as a fallback when the header is absent.
 */
export async function resolveJwtIdentity(c: Context): Promise<IdentityResult> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, code: 'AUTH_REQUIRED', message: 'Authentication required' };
  const { valid, payload } = await verifyJwtToken(token);
  if (!valid || !payload) return { ok: false, status: 401, code: 'TOKEN_INVALID', message: 'Invalid or expired token' };
  // Scope comes from the X-Project-Id header; fall back to a JWT pid claim if one exists.
  const headerPid = (c.req.header('X-Project-Id') || '').trim();
  const claimPid = typeof payload.pid === 'string' ? payload.pid.trim() : '';
  const projectId = headerPid || claimPid;
  if (!projectId) {
    return { ok: false, status: 403, code: 'PROJECT_SCOPE_REQUIRED', message: 'X-Project-Id header is required for this endpoint' };
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
