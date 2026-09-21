/**
 * SsoTypes — shared types for SSO provider selection in the login flow.
 * Kept separate from AuthManager per code-standards (models in own module).
 */

/**
 * Enabled SSO provider as returned by the backend public endpoint
 * GET /auth/sso/providers. Safe fields only — never includes secrets.
 */
export interface SsoProviderInfo {
  /** Unique provider id, e.g. "google-1737000000000". */
  provider_id: string;
  /** Provider kind used to build /auth/{provider_type}/login, e.g. "google". */
  provider_type: string;
  /** Human-readable display name, e.g. "Google". */
  name: string;
  /** Optional admin-supplied button markup (used by the web admin login). */
  login_ui_html?: string;
}
