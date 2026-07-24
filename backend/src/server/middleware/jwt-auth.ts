/**
 * JWT Authentication Middleware for multi-tenant KB isolation.
 * SA4E-30: Replaces API-key-only auth with full JWT identity injection.
 * SA4E-50: validateSession is now async — safeValidateSession awaits it.
 *
 * Behavior:
 * - If CODE_INTEL_REQUIRE_AUTH=true -> JWT required on all /api/v1/* requests
 * - If CODE_INTEL_REQUIRE_AUTH is not set -> anonymous mode (backward compat)
 * - JWT claims: sub (userId), wid (workspaceId), pid (projectId)
 */

import type { MiddlewareHandler } from 'hono';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';
import { validateSession } from '../../admin/admin-db.js';

const REQUIRE_AUTH = process.env.CODE_INTEL_REQUIRE_AUTH === 'true';
const TOKEN_SECRET = process.env.KB_TOKEN_SECRET || '';

/** Validate startup config. */
export function validateJwtConfig(): void {
  if (REQUIRE_AUTH && !TOKEN_SECRET) {
    throw new Error('KB_TOKEN_SECRET must be set when authentication is required');
  }
}

export function isJwtAuthRequired(): boolean {
  return REQUIRE_AUTH;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function verifyHs256(token: string, secret: string): Promise<boolean> {
  const [header, payload, signature] = token.split('.');
  const { createHmac } = await import('crypto');
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return signature === expected;
}

function isExpired(payload: Record<string, any>): boolean {
  if (!payload.exp) return false;
  return Date.now() >= payload.exp * 1000;
}

/**
 * Create a JWT auth middleware.
 * @param alwaysRequire When true, a valid token is ALWAYS required regardless of
 *   the global CODE_INTEL_REQUIRE_AUTH setting. Anonymous access is never allowed.
 *   Used for sensitive endpoints like indexing (no default/anonymous action).
 */
function createJwtAuth(alwaysRequire = false): MiddlewareHandler {
  return async (c, next) => {
    // X-Project-Id header is the mandatory source of project identity
    const projectId = c.req.header('X-Project-Id') || '';
    const authHeader = c.req.header('Authorization');
    const mustAuth = REQUIRE_AUTH || alwaysRequire;

    const anonymous = () => {
      const ctx = createProjectContext(projectId, 'anonymous');
      c.set('projectContext', ctx);
      return next();
    };

    const unauthorized = (code: string, message: string) =>
      c.json({ data: null, error: { code, message } }, 401);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (mustAuth) return unauthorized('AUTH_REQUIRED', 'Authentication required');
      return anonymous();
    }

    const token = authHeader.slice(7);

    if (token.trim().length === 0) {
      if (mustAuth) return unauthorized('AUTH_REQUIRED', 'Authentication required');
      return anonymous();
    }

    // Two supported formats:
    //  1. JWT (header.payload.signature) — signed with KB_TOKEN_SECRET
    //  2. Admin session token — opaque hex, validated against sessions table
    const looksLikeJwt = token.split('.').length === 3;

    if (looksLikeJwt) {
      if (TOKEN_SECRET) {
        const valid = await verifyHs256(token, TOKEN_SECRET);
        if (!valid) {
          if (!mustAuth) return anonymous();
          return unauthorized('TOKEN_INVALID', 'Invalid or expired token');
        }
      }
      const payload = decodeJwtPayload(token);
      if (!payload || isExpired(payload)) {
        if (!mustAuth) return anonymous();
        return unauthorized('TOKEN_INVALID', 'Invalid or expired token');
      }
      const ctx = createProjectContext(
        projectId || payload.pid || '',
        payload.sub || 'anonymous',
        undefined,
        payload.wid || undefined,
      );
      c.set('projectContext', ctx);
      return next();
    }

    // SA4E-50: validateSession is now async — await it
    const session = await safeValidateSession(token);
    if (!session) {
      if (!mustAuth) return anonymous();
      return unauthorized('TOKEN_INVALID', 'Invalid or expired token');
    }
    const ctx = createProjectContext(projectId, session.userId);
    c.set('projectContext', ctx);
    return next();
  };
}

/** validateSession wrapped so a DB error never crashes auth (fails closed). */
async function safeValidateSession(
  token: string,
): Promise<{ userId: string; username: string; accessGroupId: string } | null> {
  try {
    return await validateSession(token);
  } catch {
    return null;
  }
}

export interface JwtVerification {
  /** True only for a well-formed, signature-valid, non-expired JWT. */
  valid: boolean;
  payload: Record<string, any> | null;
}

/**
 * Verify a bearer credential as a JWT.
 * SA4E-41 SEC-03: shared by the tools route to bind X-Project-Id to identity.
 * SA4E-55 SR-01: If KB_TOKEN_SECRET is not configured, JWT is rejected — never
 *   accept an unverified JWT payload as trusted identity.
 */
export async function verifyJwtToken(token: string): Promise<JwtVerification> {
  const looksLikeJwt = token.split('.').length === 3;
  if (!looksLikeJwt) return { valid: false, payload: null };
  // SR-01 fix: reject JWT when secret not configured — prevents forged identity
  if (!TOKEN_SECRET) return { valid: false, payload: null };
  const ok = await verifyHs256(token, TOKEN_SECRET);
  if (!ok) return { valid: false, payload: null };
  const payload = decodeJwtPayload(token);
  if (!payload || isExpired(payload)) return { valid: false, payload: null };
  return { valid: true, payload };
}

/** Extract the set of project ids a principal is granted from JWT claims. */
export function allowedProjectsFromClaims(payload: Record<string, any>): string[] {
  const out: string[] = [];
  if (typeof payload.pid === 'string' && payload.pid) out.push(payload.pid);
  if (Array.isArray(payload.pids)) {
    out.push(...payload.pids.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0));
  }
  return out;
}

/** Standard JWT auth — anonymous allowed unless CODE_INTEL_REQUIRE_AUTH=true. */
export const jwtAuth: MiddlewareHandler = createJwtAuth(false);

/** Strict JWT auth — always requires a valid token, never anonymous. */
export const jwtAuthStrict: MiddlewareHandler = createJwtAuth(true);
