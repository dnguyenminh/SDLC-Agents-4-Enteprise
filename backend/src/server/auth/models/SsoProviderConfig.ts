/**
 * SA4E-309 — Per-provider SSO configuration loaded from the `sso_providers` table.
 *
 * Providers other than Entra (Google, GitHub, ...) are configured via the Admin UI
 * and stored in the database, NOT via env vars. This model is the normalized shape
 * a strategy needs to build its authorize URL and exchange the auth code.
 */
export interface SsoProviderConfig {
  providerType: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}
