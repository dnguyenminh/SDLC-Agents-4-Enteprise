/**
 * Unit tests — admin/db/jwt.ts (SA4E-321 dual-token access JWT).
 * Covers the sign/verify round trip and every way a token must be rejected:
 * tampering, expiry, malformed shape, and opaque refresh tokens.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'crypto';
import {
  ACCESS_TTL_SEC,
  getJwtSecret,
  looksLikeJwt,
  signAccessJwt,
  verifyAccessJwt,
} from '../jwt.js';

const ENV_SECRET = 'unit-test-secret';
let previousSecret: string | undefined;

beforeAll(() => {
  previousSecret = process.env.KB_TOKEN_SECRET;
  process.env.KB_TOKEN_SECRET = ENV_SECRET;
});

afterAll(() => {
  if (previousSecret === undefined) delete process.env.KB_TOKEN_SECRET;
  else process.env.KB_TOKEN_SECRET = previousSecret;
});

function forge(payload: Record<string, unknown>, secret = ENV_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

describe('access JWT signing/verification', () => {
  it('round-trips the claims it was signed with', () => {
    const token = signAccessJwt({ sub: 'user-1', sid: 'sess-abc', pid: 'proj-1' });
    const result = verifyAccessJwt(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.sub).toBe('user-1');
    expect(result.claims.sid).toBe('sess-abc');
    expect(result.claims.pid).toBe('proj-1');
  });

  it('sets a 15-minute expiry', () => {
    const token = signAccessJwt({ sub: 'user-1', sid: 'sess-abc' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.exp - payload.iat).toBe(ACCESS_TTL_SEC);
    expect(ACCESS_TTL_SEC).toBe(15 * 60);
  });

  it('rejects a token signed with a different secret', () => {
    const token = forge({ sub: 'attacker', sid: 'sess-x', exp: Math.floor(Date.now() / 1000) + 600 }, 'wrong-secret');
    const result = verifyAccessJwt(token);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('bad_signature');
  });

  it('rejects an expired token', () => {
    const token = forge({ sub: 'user-1', sid: 'sess-x', exp: Math.floor(Date.now() / 1000) - 10 });
    const result = verifyAccessJwt(token);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('expired');
  });

  it('rejects a tampered payload even when the header is valid', () => {
    const token = signAccessJwt({ sub: 'user-1', sid: 'sess-abc' });
    const [header, , sig] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 'admin', sid: 'sess-abc', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    const result = verifyAccessJwt(`${header}.${evil}.${sig}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('bad_signature');
  });

  it('rejects tokens that are not exactly three parts', () => {
    expect(verifyAccessJwt('onlyonepart').ok).toBe(false);
    expect(verifyAccessJwt('a.b.c.d').ok).toBe(false);
    expect(verifyAccessJwt('a.b.').ok).toBe(false);
    expect(verifyAccessJwt('').ok).toBe(false);
  });

  it('rejects a signed token that carries no session id', () => {
    const result = verifyAccessJwt(forge({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_session');
  });

  it('does not treat an opaque refresh token as a JWT', () => {
    const opaque = 'a'.repeat(64);
    expect(looksLikeJwt(opaque)).toBe(false);
    expect(verifyAccessJwt(opaque).ok).toBe(false);
  });

  it('prefers KB_TOKEN_SECRET from the environment', () => {
    expect(getJwtSecret()).toBe(ENV_SECRET);
  });
});
