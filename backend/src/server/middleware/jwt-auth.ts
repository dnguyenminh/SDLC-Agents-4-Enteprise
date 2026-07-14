/**
 * JWT Authentication Middleware for multi-tenant KB isolation.
 * SA4E-30: Replaces API-key-only auth with full JWT identity injection.
 *
 * Behavior:
 * - If CODE_INTEL_REQUIRE_AUTH=true -> JWT required on all /api/v1/* requests
 * - If CODE_INTEL_REQUIRE_AUTH is not set -> anonymous mode (backward compat)
 * - JWT claims: sub (userId), wid (workspaceId), pid (projectId)
 */

import type { MiddlewareHandler } from 'hono';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';

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

export const jwtAuth: MiddlewareHandler = async (c, next) => {
  // X-Project-Id header is the mandatory source of project identity
  const projectId = c.req.header('X-Project-Id') || '';
  const authHeader = c.req.header('Authorization');

  // Helper: build anonymous context, preserving X-Project-Id
  const anonymous = () => {
    const ctx = createProjectContext(projectId, 'anonymous');
    c.set('projectContext', ctx);
    return next();
  };

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (REQUIRE_AUTH) {
      return c.json({
        data: null,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      }, 401);
    }
    return anonymous();
  }

  const token = authHeader.slice(7);

  // Verify signature
  if (TOKEN_SECRET) {
    const valid = await verifyHs256(token, TOKEN_SECRET);
    if (!valid) {
      if (!REQUIRE_AUTH) return anonymous();
      return c.json({
        data: null,
        error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' }
      }, 401);
    }
  }

  // Decode payload
  const payload = decodeJwtPayload(token);
  if (!payload || isExpired(payload)) {
    if (!REQUIRE_AUTH) return anonymous();
    return c.json({
      data: null,
      error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' }
    }, 401);
  }

  // X-Project-Id header takes precedence over JWT pid claim
  const ctx = createProjectContext(
    projectId || payload.pid || '',
    payload.sub || 'anonymous',
    undefined,
    payload.wid || undefined,
  );
  c.set('projectContext', ctx);
  return next();
};
