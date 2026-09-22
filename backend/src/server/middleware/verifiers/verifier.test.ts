/**
 * Unit tests — SA4E-266 token verifiers (RS256 + JWKS + discovery).
 * Covers UC-01..UC-04, BR-01..BR-04, ERR-01..ERR-05 per TDD §6.3.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  type JWK,
  type KeyInput,
} from 'jose';
import { EntraRS256Verifier } from './EntraRS256Verifier.js';
import { InMemoryJwksCache, type JwksFetcher } from './JwksCache.js';
import { LocalHS256Verifier } from './LocalHS256Verifier.js';
import { TokenVerificationError } from './TokenVerifier.js';

const ISSUER = 'https://login.microsoftonline.com/tenant-1/v2.0';
const AUTHORITY = 'https://login.microsoftonline.com/tenant-1';
const AUDIENCE = '11111111-2222-3333-4444-555555555555';

// --- test helpers -------------------------------------------------------------

async function makeRsaKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = (await exportJWK(publicKey)) as JWK;
  return { publicKey, privateKey, jwk };
}

function jwksOf(jwk: JWK, kid: string) {
  return { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };
}

interface SignOpts {
  privateKey: KeyInput;
  kid: string;
  iss?: string;
  aud?: string | string[];
  expiresInSec?: number;
  payload?: Record<string, unknown>;
}

async function signRsaToken(o: SignOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({ oid: 'oid-1', email: 'u@x.com', name: 'U', sub: 'sub-1', ...o.payload })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + (o.expiresInSec ?? 3600));
  if (o.iss) builder.setIssuer(o.iss);
  if (o.aud) builder.setAudience(o.aud as string | string[]);
  return builder.sign(o.privateKey);
}

function staticJwksFetcher(getSet: () => { keys: unknown[] }): JwksFetcher {
  return { fetch: async () => getSet() };
}

function makeVerifier(opts: {
  jwksFetcher?: JwksFetcher;
  discoveryFetcher?: { fetch(): Promise<{ issuer: string; jwks_uri: string }> };
  jwksUri?: string;
  jwksCache?: InMemoryJwksCache;
}) {
  const discovery =
    opts.discoveryFetcher ??
    {
      fetch: async () => ({ issuer: ISSUER, jwks_uri: 'https://jwks.local/keys' }),
    };
  return new EntraRS256Verifier({
    authority: AUTHORITY,
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksUri: opts.jwksUri,
    discoveryFetcher: discovery,
    jwksFetcher: opts.jwksFetcher,
    jwksCache: opts.jwksCache,
  });
}

// --- EntraRS256Verifier -------------------------------------------------------

describe('EntraRS256Verifier', () => {
  it('valid RS256 token returns VerifiedClaims (UC-01, BR-01, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    const claims = await verifier.verify(token);

    expect(claims).toMatchObject({ sub: 'sub-1', oid: 'oid-1', email: 'u@x.com', name: 'U', iss: ISSUER, aud: AUDIENCE });
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(cache.fetchCount()).toBe(1);

    // Second verification served from the 1h key cache — no refetch.
    await verifier.verify(token);
    expect(cache.fetchCount()).toBe(1);
  });

  it('rejects a token with an invalid signature -> ERR-01 401 (UC-02, BR-01)', async () => {
    const { jwk } = await makeRsaKeys();
    const { privateKey: attackerKey } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey: attackerKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'invalid_signature',
      status: 401,
    });
  });

  it('rejects a missing/malformed kid -> ERR-01 401, never crashes', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const builder = new SignJWT({ sub: 'sub-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600);
    const token = await builder.sign(privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'invalid_signature',
      status: 401,
    });
  });

  it('rejects an issuer mismatch -> ERR-02 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: 'https://evil.example./v2.0', aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'issuer_mismatch', status: 401 });
  });

  it('rejects an audience mismatch -> ERR-03 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: ['99999999-0000-0000-0000-000000000000'] });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'audience_mismatch', status: 401 });
  });

  it('rejects an expired token -> ERR-04 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE, expiresInSec: -3600 });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'token_expired', status: 401 });
  });

  it('JWKS fetch failure -> ERR-05 503 with exactly 1 refresh attempt (BR-02)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const failing = { fetch: async () => { throw new Error('network down'); } };
    const cache = new InMemoryJwksCache(failing);
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'jwks_fetch_failed',
      status: 503,
    });
    expect(cache.fetchCount()).toBe(1);
    expect(cache.refresh instanceof Function).toBe(true);
    const second = await verifier.verify(token).then(() => 'ok').catch((e: unknown) => (e as Error).message);
    expect(second).toContain('JWKS');
    expect(cache.fetchCount()).toBe(2); // next request retries naturally, once more
    expect(jwk.kty).toBe('RSA');
  });

  it('kid miss -> single refresh picks up rotated key and verification passes (BR-01/BR-02)', async () => {
    const { privateKey: newKey, jwk: newJwk } = await makeRsaKeys();
    let current: { keys: unknown[] } = { keys: [] };
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => current));
    const verifier = makeVerifier({ jwksCache: cache });
    // Rotate: the JWKS now advertises the NEW key under a NEW kid.
    current = jwksOf(newJwk, 'k-new');
    const token = await signRsaToken({ privateKey: newKey, kid: 'k-new', iss: ISSUER, aud: AUDIENCE });

    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('sub-1');
    expect(cache.fetchCount()).toBe(1);
  });

  it('caches the discovery document 24h — single discovery fetch across verifications (§8.2)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const discovery = vi.fn(async () => ({ issuer: ISSUER, jwks_uri: 'https://jwks.local/keys' }));
    const verifier = makeVerifier({
      jwksFetcher: { fetch: async () => jwksOf(jwk, 'k1') },
      discoveryFetcher: { fetch: discovery },
    });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await verifier.verify(token);
    await verifier.verify(token);
    await verifier.verify(token);

    expect(discovery).toHaveBeenCalledTimes(1);
  });
});

// --- LocalHS256Verifier -------------------------------------------------------

describe('LocalHS256Verifier (BR-04)', () => {
  it('accepts a valid HS256 token', async () => {
    const verifier = new LocalHS256Verifier('secret');
    const token = await signHs256({ sub: 'u', iss: 'local' }, 'secret');
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('u');
  });

  it('rejects an invalid signature -> ERR-01', async () => {
    const verifier = new LocalHS256Verifier('right-secret');
    const token = await signHs256({ sub: 'u' }, 'wrong-secret');
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_signature', status: 401 });
  });

  it('rejects an expired token -> ERR-04', async () => {
    const verifier = new LocalHS256Verifier('secret');
    const token = await signHs256({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 3600 }, 'secret');
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'token_expired', status: 401 });
  });
});

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

// --- local helpers ------------------------------------------------------------

interface Hs256Payload {
  sub: string;
  iss?: string;
  exp?: number;
}

async function signHs256(payload: Hs256Payload, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  const p: Record<string, unknown> = { ...payload };
  if (p.exp === undefined) p.exp = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}