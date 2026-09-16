/**
 * Entra RS256 auth wiring helpers (SA4E-266).
 * Centralizes the SSO gate, env-based startup validation, token-type detection
 * and the fail-closed verification handler so jwt-auth.ts stays focused on
 * the request lifecycle.
 */

import type { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createProjectContext } from '../../../modules/memory/ProjectContext.js';
import { EntraRS256Verifier } from './EntraRS256Verifier.js';
import { parseJwtHeader, type TokenVerifier } from './TokenVerifier.js';

const SSO_ENABLED = process.env.SSO_ENABLED === 'true' || process.env.SSO_ENABLED === '1';
const ENTRA_AUTHORITY = (process.env.ENTRA_AUTHORITY || '').trim();
const ENTRA_ISSUER = (process.env.ENTRA_ISSUER || '').trim();
const ENTRA_JWKS_URI = (process.env.ENTRA_JWKS_URI || '').trim();
const ENTRA_CLIENT_ID = (process.env.ENTRA_CLIENT_ID || '').trim();

let entraVerifier: TokenVerifier | null = null;

/** Fail-fast (TDD §3.1): when the SSO gate is on, Entra verification vars are required. */
export function validateEntraAuthConfig(): void {
  if (!SSO_ENABLED) return;
  if (!ENTRA_AUTHORITY) throw new Error('ENTRA_AUTHORITY must be set when SSO_ENABLED=true');
  if (!ENTRA_ISSUER) throw new Error('ENTRA_ISSUER must be set when SSO_ENABLED=true');
  if (!ENTRA_CLIENT_ID) throw new Error('ENTRA_CLIENT_ID must be set when SSO_ENABLED=true');
}

/** Lazily built RS256 verifier — constructed once, reused across requests. */
export function getEntraVerifier(): TokenVerifier | null {
  if (!SSO_ENABLED || !ENTRA_AUTHORITY || !ENTRA_ISSUER || !ENTRA_CLIENT_ID) return null;
  if (!entraVerifier) {
    entraVerifier = new EntraRS256Verifier({
      authority: ENTRA_AUTHORITY,
      issuer: ENTRA_ISSUER,
      audience: ENTRA_CLIENT_ID,
      jwksUri: ENTRA_JWKS_URI || undefined,
    });
  }
  return entraVerifier;
}

/**
 * SA4E-266 detection rule (FSD §8.1): header carries `kid` AND the payload `iss`
 * points at the configured Entra authority. Signature is not checked here.
 */
export function isEntraToken(token: string, detPayload: Record<string, unknown> | null): boolean {
  if (!SSO_ENABLED || !detPayload?.iss) return false;
  const header = parseJwtHeader(token);
  if (!header?.kid) return false;
  const issHitsEntra =
    detPayload.iss === ENTRA_ISSUER ||
    (!!ENTRA_AUTHORITY && typeof detPayload.iss === 'string' && detPayload.iss.startsWith(ENTRA_AUTHORITY));
  return issHitsEntra;
}

/**
 * Verify an Entra RS256 token and bind identity or return a fail-closed error.
 * Never falls back to anonymous (§5); 503 poison for any unexpected internal error.
 */
export async function tryEntraVerification(
  entra: TokenVerifier,
  token: string,
  c: Context,
  next: Next,
  projectId: string,
): Promise<Response | void> {
  try {
    const claims = await entra.verify(token);
    const ctx = createProjectContext(
      projectId || claims.oid || claims.sub,
      claims.sub || claims.email || 'entra-user',
    );
    c.set('projectContext', ctx);
    return next();
  } catch (err) {
    const e = err as { name?: string; code?: string; status?: number; message?: string } | undefined;
    if (e?.name === 'TokenVerificationError' && typeof e.code === 'string' && typeof e.status === 'number') {
      return c.json({ data: null, error: { code: e.code, message: e.message ?? '' } }, e.status as ContentfulStatusCode);
    }
    return c.json(
      { data: null, error: { code: 'jwks_fetch_failed', message: 'JWKS unavailable after refresh attempt' } },
      503,
    );
  }
}