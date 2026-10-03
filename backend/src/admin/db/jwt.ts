/**
 * admin/db/jwt.ts — Access-token JWT issue/verify (HS256).
 * Dual-token auth (SA4E-321): short-lived access JWT (Bearer) + long-lived
 * opaque refresh token. Byte-compatible with LocalHS256Verifier /
 * jwt-auth verifyHs256 so one secret signs everything.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, loadConfig } from '../../config/index.js';

/** Access-token lifetime: 15 minutes. */
export const ACCESS_TTL_SEC = 15 * 60;

/** Claims carried by every access JWT. sid is mandatory (revocation key). */
export interface AccessClaims {
  /** User id. */
  sub: string;
  /** Session id — logout/revocation lookup key. */
  sid: string;
  /** Default project id. */
  pid?: string;
  /** Workspace id. */
  wid?: string;
  /** Issued-at (epoch seconds). */
  iat?: number;
  /** Expiry (epoch seconds). */
  exp?: number;
}

export type VerifyResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'bad_payload' | 'expired' | 'no_session' };

let provisionedSecret: string | null = null;

function secretFilePath(): string {
  const cfg = loadConfig();
  const dir = path.isAbsolute(cfg.dataDir) ? cfg.dataDir : path.resolve(getWorkspacePath(), cfg.dataDir);
  return path.join(dir, '.jwt-secret');
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Resolve the HS256 signing secret: KB_TOKEN_SECRET env (operator-managed),
 * else provisioned <dataDir>/.jwt-secret (survives restarts), else an
 * ephemeral per-process secret (read-only FS / test sandbox).
 */
export function getJwtSecret(): string {
  const envSecret = (process.env.KB_TOKEN_SECRET || '').trim();
  if (envSecret) return envSecret;
  if (provisionedSecret) return provisionedSecret;

  const file = secretFilePath();
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
    if (existing) {
      provisionedSecret = existing;
      return existing;
    }
    const generated = randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
    provisionedSecret = generated;
    return generated;
  } catch {
    const generated = randomBytes(48).toString('hex');
    provisionedSecret = generated;
    return generated;
  }
}

/** Sign a short-lived access JWT. */
export function signAccessJwt(claims: AccessClaims): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ACCESS_TTL_SEC }));
  return `${header}.${payload}.${hmac(`${header}.${payload}`, getJwtSecret())}`;
}

/** Verify an access JWT. Rejects anything that is not a 3-part signed, live token. */
export function verifyAccessJwt(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false, reason: 'malformed' };
  }
  if (!constantTimeEqual(parts[2], hmac(`${parts[0]}.${parts[1]}`, getJwtSecret()))) {
    return { ok: false, reason: 'bad_signature' };
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (typeof payload['exp'] !== 'number' || Date.now() >= payload['exp'] * 1000) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload['sid'] !== 'string' || !payload['sid'] || typeof payload['sub'] !== 'string' || !payload['sub']) {
    return { ok: false, reason: 'no_session' };
  }
  return { ok: true, claims: payload as unknown as AccessClaims };
}

/** True when the credential has JWT shape (3 dot-separated parts). */
export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}
