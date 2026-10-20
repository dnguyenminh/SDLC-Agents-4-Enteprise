/**
 * Shared env fixtures for EntraProviderStrategy tests.
 * Split from EntraProviderStrategy.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — fixtures relocated.
 */
import { vi } from 'vitest';

export const TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
export const CLIENT_SECRET = 'secret12345';
export const REDIRECT_URI = 'http://localhost:3000/auth/entra/callback';
export const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

/** Build a fake (unsigned) id_token from a claims payload for decode-path tests. */
export function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

export function setupEntraEnv(): void {
  process.env.SSO_ENABLED = 'true';
  process.env.ENTRA_TENANT_ID = TENANT_ID;
  process.env.ENTRA_CLIENT_ID = CLIENT_ID;
  process.env.ENTRA_CLIENT_SECRET = CLIENT_SECRET;
  process.env.ENTRA_REDIRECT_URI = REDIRECT_URI;
  process.env.ENTRA_AUTHORITY = AUTHORITY;
  process.env.ENTRA_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
  process.env.ENTRA_JWKS_URI = `${AUTHORITY}/discovery/v2.0/keys`;
  process.env.ENTRA_SCOPES = 'openid profile email offline_access';
}

export function teardownEntraEnv(): void {
  delete process.env.SSO_ENABLED;
  delete process.env.ENTRA_TENANT_ID;
  delete process.env.ENTRA_CLIENT_ID;
  delete process.env.ENTRA_CLIENT_SECRET;
  delete process.env.ENTRA_REDIRECT_URI;
  delete process.env.ENTRA_AUTHORITY;
  delete process.env.ENTRA_ISSUER;
  delete process.env.ENTRA_JWKS_URI;
  delete process.env.ENTRA_SCOPES;
  vi.restoreAllMocks();
}
