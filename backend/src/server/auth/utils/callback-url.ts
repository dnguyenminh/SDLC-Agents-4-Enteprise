/**
 * SA4E-262 — SSO callback (redirect_uri) helper.
 *
 * The OAuth2/OIDC redirect_uri MUST match exactly between the authorize request
 * and the token exchange, and must point at THIS backend's /auth/{provider}/callback
 * endpoint. Admins should not have to hand-type it (and must not get it wrong),
 * so when the sso_providers row leaves redirect_uri empty we derive a sensible
 * default from the deployment base URL. The same value is surfaced in the Admin UI
 * so it can be registered verbatim at the IdP (Google/GitHub/Entra console).
 */

/** Base URL of this backend, used to build absolute callback URLs. */
export function ssoBaseUrl(): string {
  const explicit = process.env.SSO_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const port = process.env.CODE_INTEL_PORT || process.env.PORT || '48721';
  return `http://localhost:${port}`;
}

/**
 * The canonical callback URL the backend serves for a provider.
 * @param providerType e.g. 'google' | 'github' | 'entra'
 */
export function defaultCallbackUrl(providerType: string): string {
  return `${ssoBaseUrl()}/auth/${providerType}/callback`;
}

/**
 * Resolve the effective redirect_uri for a provider: use the configured value
 * when present, otherwise fall back to the derived default callback URL.
 */
export function resolveRedirectUri(providerType: string, configured: string | undefined): string {
  const trimmed = configured?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultCallbackUrl(providerType);
}
