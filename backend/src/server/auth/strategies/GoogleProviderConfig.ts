/**
 * SA4E-308 — Google provider config loader.
 * Reads client_id / client_secret / redirect_uri / scopes from the sso_providers
 * table (provider_type='google', enabled=1). NEVER reads env — configuration is
 * managed via the Admin UI. Missing/incomplete config produces a clear error.
 */

import { GOOGLE_DEFAULT_SCOPES } from '../models/GoogleClaims.js';
import { resolveRedirectUri } from '../utils/callback-url.js';

/** Resolved Google configuration required to run the OIDC flow. */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

interface SsoProviderRow {
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
  scopes?: string;
}

/** Thrown when the google provider is missing or not fully configured. */
export class GoogleConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'GoogleConfigError';
  }
}

/** Split a stored space/comma separated scope string into a clean token list. */
function parseScopes(raw: string | undefined): string[] {
  const scopes = (raw ?? '').split(/[\s,]+/).filter(Boolean);
  return scopes.length > 0 ? scopes : [...GOOGLE_DEFAULT_SCOPES];
}

/** Assert every required field is present; throw a specific error otherwise. */
function requireField(row: SsoProviderRow, field: keyof SsoProviderRow, label: string): string {
  const value = row[field]?.trim();
  if (!value) {
    throw new GoogleConfigError(
      `Google SSO not configured: '${label}' is empty. Set it in Admin → SSO Providers (google).`,
    );
  }
  return value;
}

/**
 * Load the enabled Google provider row and map it to a GoogleConfig.
 * @throws GoogleConfigError if no enabled google row exists or fields are missing.
 */
export async function loadGoogleConfig(): Promise<GoogleConfig> {
  const { getAdminDb } = await import('../../../admin/admin-db.js');
  const db = getAdminDb();
  const row = await db.getAsync(
    'SELECT client_id, client_secret, redirect_uri, scopes FROM sso_providers WHERE provider_type = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1',
    ['google'],
  ) as SsoProviderRow | undefined;

  if (!row) {
    throw new GoogleConfigError(
      'Google SSO not configured: no enabled google provider found in sso_providers.',
    );
  }

  return {
    clientId: requireField(row, 'client_id', 'client_id'),
    clientSecret: requireField(row, 'client_secret', 'client_secret'),
    // redirect_uri is optional in the row: fall back to the derived default
    // callback (SSO_BASE_URL/auth/google/callback) so admins can't misconfigure it.
    redirectUri: resolveRedirectUri('google', row.redirect_uri),
    scopes: parseScopes(row.scopes),
  };
}
