/**
 * HS256 token verifier — extraction of the legacy JWT logic from jwt-auth.ts.
 * SA4E-266 (BR-04): signature + expiry semantics MUST remain identical to the
 * pre-existing inline code path (Node crypto.createHmac, base64url, isExpired).
 */

import { createHmac } from 'crypto';
import {
  TokenVerificationError,
  type TokenVerifier,
  type VerifiedClaims,
  type VerificationErrorCode,
} from './TokenVerifier.js';

export class LocalHS256Verifier implements TokenVerifier {
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  async verify(token: string): Promise<VerifiedClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw unauthorized('invalid_signature', 'Invalid or expired token');

    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (signature !== expected) {
      throw unauthorized('invalid_signature', 'Invalid or expired token');
    }

    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      throw unauthorized('invalid_signature', 'Invalid or expired token');
    }

    if (isExpired(claims)) throw unauthorized('token_expired', 'Invalid or expired token');

    return {
      sub: toStr(claims.sub),
      oid: toStr(claims.oid),
      email: toStr(claims.email),
      name: toStr(claims.name),
      iss: toStr(claims.iss),
      aud: toStr(claims.aud),
      exp: typeof claims.exp === 'number' ? claims.exp : 0,
    };
  }
}

function isExpired(payload: Record<string, unknown>): boolean {
  if (typeof payload.exp !== 'number') return false;
  return Date.now() >= payload.exp * 1000;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function unauthorized(code: VerificationErrorCode, message: string): TokenVerificationError {
  return new TokenVerificationError(code, message, 401);
}