/**
 * Token verification strategy interface (SA4E-266).
 * Adopted by LocalHS256Verifier (legacy, BR-04) and EntraRS256Verifier (new).
 */

export interface VerifiedClaims {
  /** Subject — propagated to session context. */
  sub: string;
  /** Entra object ID — propagated to session context. */
  oid: string;
  /** User email — propagated to session context. */
  email: string;
  /** Display name — propagated to session context. */
  name: string;
  /** Issuer (Entra tenant URL) — validated against configured issuer. */
  iss: string;
  /** Audience (client ID) — validated against configured audience. */
  aud: string;
  /** Expiration (epoch seconds) — validated as future. */
  exp: number;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedClaims>;
}

export type VerificationErrorCode =
  | 'invalid_signature'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'token_expired'
  | 'jwks_fetch_failed';

/** Typed verification failure — jwt-auth maps code + status to the HTTP response. */
export class TokenVerificationError extends Error {
  readonly code: VerificationErrorCode;
  readonly status: number;

  constructor(code: VerificationErrorCode, message: string, status: number) {
    super(message);
    this.name = 'TokenVerificationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Parse the JWT header (base64url segment 0) to read `kid` and `alg`.
 * Detection input for the SA4E-266 strategy selector. Never throws.
 */
export function parseJwtHeader(token: string): { kid?: string; alg?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header: Record<string, unknown> = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    );
    return {
      kid: typeof header.kid === 'string' ? header.kid : undefined,
      alg: typeof header.alg === 'string' ? header.alg : undefined,
    };
  } catch {
    return null;
  }
}