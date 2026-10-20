/**
 * Unit tests — SA4E-266 jwt-auth strategy wiring (detection, BR-04 regression).
 * Entra RS256 routing + fail-closed error mapping + legacy HS256 preservation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenVerificationError } from './TokenVerifier.js';
import { ISSUER, AUTHORITY, AUDIENCE } from './helpers.js';

// --- jwt-auth wiring (SA4E-266 detection, BR-04 regression) -------------------

const projectContexts: unknown[][] = [];

vi.mock('../../../modules/memory/ProjectContext.js', () => ({
  createProjectContext: (...args: unknown[]) => {
    projectContexts.push(args);
    return { projectId: args[0], userId: args[1] };
  },
}));
vi.mock('../../../admin/admin-db.js', () => ({
  validateSession: async () => null,
}));

function makeContext(headers: Record<string, string | undefined>) {
  const set = vi.fn();
  const json = vi.fn((body: unknown, status: number) => ({ body, status }));
  const c: any = { req: { header: (name: string) => headers[name] }, set, json };
  return { c, set, json };
}

function makeEntraLikeToken(iss: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ iss, sub: 'u', aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${header}.${body}.bogus-signature`;
}

async function importJwtAuth() {
  vi.resetModules();
  return await import('../jwt-auth.js');
}

describe('jwt-auth strategy wiring (SA4E-266)', () => {
  const mockVerify = vi.fn();

  beforeEach(() => {
    mockVerify.mockReset();
    projectContexts.length = 0;
    process.env.KB_TOKEN_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete (process.env as any).SSO_ENABLED;
    delete (process.env as any).ENTRA_AUTHORITY;
    delete (process.env as any).ENTRA_ISSUER;
    delete (process.env as any).ENTRA_CLIENT_ID;
    delete (process.env as any).ENTRA_JWKS_URI;
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
    vi.doUnmock('./EntraRS256Verifier.js');
  });

  it('routes an RS256 token (kid + iss match) to EntraRS256Verifier and binds identity', async () => {
    process.env.SSO_ENABLED = 'true';
    process.env.ENTRA_AUTHORITY = AUTHORITY;
    process.env.ENTRA_ISSUER = ISSUER;
    process.env.ENTRA_CLIENT_ID = AUDIENCE;
    mockVerify.mockResolvedValue({ sub: 'u', oid: 'obj-9', email: 'e', name: 'n', iss: ISSUER, aud: AUDIENCE, exp: 9999999999 });

    vi.doMock('./EntraRS256Verifier.js', () => ({
      EntraRS256Verifier: class {
        constructor(_opts: unknown) {}
        async verify(token: string) {
          return mockVerify(token);
        }
      },
    }));

    const { jwtAuth } = await importJwtAuth();
    const { c, set } = makeContext({ Authorization: `Bearer ${makeEntraLikeToken(ISSUER)}` });
    const next = vi.fn();
    await jwtAuth(c, next);

    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('projectContext', expect.objectContaining({ userId: 'u', projectId: 'obj-9' }));
  });

  it('maps a verifier failure to its error code and status (fail closed, §5)', async () => {
    process.env.SSO_ENABLED = 'true';
    process.env.ENTRA_AUTHORITY = AUTHORITY;
    process.env.ENTRA_ISSUER = ISSUER;
    process.env.ENTRA_CLIENT_ID = AUDIENCE;
    mockVerify.mockRejectedValue(new TokenVerificationError('issuer_mismatch', 'issuer mismatch', 401));

    vi.doMock('./EntraRS256Verifier.js', () => ({
      EntraRS256Verifier: class {
        constructor(_opts: unknown) {}
        async verify(token: string) {
          return mockVerify(token);
        }
      },
    }));

    const { jwtAuth } = await importJwtAuth();
    const res = await jwtAuth(makeContext({ Authorization: `Bearer ${makeEntraLikeToken(ISSUER)}` }).c, vi.fn()) as any;

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('issuer_mismatch');
  });

  it('maps an unexpected verifier error to ERR-05 503 (never anonymous)', async () => {
    process.env.SSO_ENABLED = 'true';
    process.env.ENTRA_AUTHORITY = AUTHORITY;
    process.env.ENTRA_ISSUER = ISSUER;
    process.env.ENTRA_CLIENT_ID = AUDIENCE;
    mockVerify.mockRejectedValue(new Error('boom'));

    vi.doMock('./EntraRS256Verifier.js', () => ({
      EntraRS256Verifier: class {
        constructor(_opts: unknown) {}
        async verify(token: string) {
          return mockVerify(token);
        }
      },
    }));

    const { jwtAuth } = await importJwtAuth();
    const res = await jwtAuth(makeContext({ Authorization: `Bearer ${makeEntraLikeToken(ISSUER)}` }).c, vi.fn()) as any;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('jwks_fetch_failed');
    expect(projectContexts.length).toBe(0);
  });

  it('does NOT route HS256 / non-matching tokens to Entra when SSO enabled (legacy path intact)', async () => {
    process.env.SSO_ENABLED = 'true';
    process.env.ENTRA_AUTHORITY = AUTHORITY;
    process.env.ENTRA_ISSUER = ISSUER;
    process.env.ENTRA_CLIENT_ID = AUDIENCE;

    vi.doMock('./EntraRS256Verifier.js', () => ({
      EntraRS256Verifier: class {
        constructor(_opts: unknown) {}
        async verify(token: string) {
          return mockVerify(token);
        }
      },
    }));

    const { jwtAuth } = await importJwtAuth();
    // Token has NO kid header (plain HS256) → should NOT reach the RS256 path.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'local', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const hmac = await import('crypto');
    const sig = hmac.createHmac('sha256', 'test-secret').update(`${header}.${body}`).digest('base64url');
    const token = `${header}.${body}.${sig}`;

    const { c, set } = makeContext({ Authorization: `Bearer ${token}` });
    const next = vi.fn();
    await jwtAuth(c, next);

    expect(mockVerify).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('projectContext', expect.objectContaining({ userId: 'local' }));
  });

  it('legacy HS256 is unchanged with SSO disabled (BR-04): invalid signature -> anonymous when not required', async () => {
    delete (process.env as any).SSO_ENABLED;
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    const { jwtAuth } = await importJwtAuth();
    const bad = await import('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const sig = bad.createHmac('sha256', 'NOPE').update(`${header}.${body}`).digest('base64url');
    const token = `${header}.${body}.${sig}`;

    const { c } = makeContext({ Authorization: `Bearer ${token}` });
    const next = vi.fn();
    await jwtAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1); // anonymous fallback preserved
    expect(projectContexts[0]?.[1]).toBe('anonymous');
  });
});
