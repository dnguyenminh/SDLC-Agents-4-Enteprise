/**
 * SA4E-309 — Loader for per-provider SSO config from the `sso_providers` table.
 *
 * Single source of truth for reading client_id/secret/redirect_uri/scopes of a
 * database-configured provider (Google, GitHub, ...). Keeps DB access out of the
 * strategy classes (DIP) and avoids duplicating the query per provider (DRY).
 */
import type { SsoProviderConfig } from '../models/SsoProviderConfig.js';
import { resolveRedirectUri } from './callback-url.js';

interface SsoProviderRow {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes: string;
}

/** Split a stored scopes string (space or comma separated) into a clean array. */
function parseScopes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean);
}

/**
 * Load the enabled config row for a provider type from `sso_providers`.
 * @param providerType e.g. 'github'
 * @returns config, or null when the provider is not enabled/configured
 * @throws Error if the provider is enabled but missing client_id/secret/redirect
 */
export async function loadSsoProviderConfig(
  providerType: string,
): Promise<SsoProviderConfig | null> {
  const { getDbAdapter } = await import('../../../admin/db/core.js');
  const db = getDbAdapter();
  const row = await db.getAsync<SsoProviderRow>(
    'SELECT client_id, client_secret, redirect_uri, scopes FROM sso_providers WHERE provider_type = ? AND enabled = 1',
    [providerType],
  );
  if (!row) return null;
  return buildConfig(providerType, row);
}

/** Validate required fields and normalize a DB row into SsoProviderConfig. */
function buildConfig(providerType: string, row: SsoProviderRow): SsoProviderConfig {
  const clientId = row.client_id?.trim() ?? '';
  const clientSecret = row.client_secret?.trim() ?? '';
  // redirect_uri is optional: only client_id/secret are truly required from the
  // admin. The callback URL is derived (SSO_BASE_URL/auth/{provider}/callback)
  // when left empty so it always matches the backend endpoint and cannot be typo'd.
  if (!clientId || !clientSecret) {
    throw new Error(`sso_provider_misconfigured: ${providerType} missing client_id/secret`);
  }
  const redirectUri = resolveRedirectUri(providerType, row.redirect_uri);
  return { providerType, clientId, clientSecret, redirectUri, scopes: parseScopes(row.scopes) };
}
