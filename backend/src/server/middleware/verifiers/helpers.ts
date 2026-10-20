/**
 * Shared fixtures for SA4E-266 token verifier tests.
 * See verifier.*.test.ts files in this folder.
 */
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  type JWK,
  type KeyInput,
} from 'jose';
import { InMemoryJwksCache, type JwksFetcher } from './JwksCache.js';
import { EntraRS256Verifier } from './EntraRS256Verifier.js';

export const ISSUER = 'https://login.microsoftonline.com/tenant-1/v2.0';
export const AUTHORITY = 'https://login.microsoftonline.com/tenant-1';
export const AUDIENCE = '11111111-2222-3333-4444-555555555555';

export async function makeRsaKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = (await exportJWK(publicKey)) as JWK;
  return { publicKey, privateKey, jwk };
}

export function jwksOf(jwk: JWK, kid: string) {
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

export async function signRsaToken(o: SignOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({ oid: 'oid-1', email: 'u@x.com', name: 'U', sub: 'sub-1', ...o.payload })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + (o.expiresInSec ?? 3600));
  if (o.iss) builder.setIssuer(o.iss);
  if (o.aud) builder.setAudience(o.aud as string | string[]);
  return builder.sign(o.privateKey);
}

export function staticJwksFetcher(getSet: () => { keys: unknown[] }): JwksFetcher {
  return { fetch: async () => getSet() };
}

export function makeVerifier(opts: {
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

// --- local helpers ------------------------------------------------------------

interface Hs256Payload {
  sub: string;
  iss?: string;
  exp?: number;
}

export async function signHs256(payload: Hs256Payload, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  const p: Record<string, unknown> = { ...payload };
  if (p.exp === undefined) p.exp = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
