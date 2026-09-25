/**
 * SA4E-309 — GitHub SSO strategy (OAuth2, NOT OIDC).
 *
 * GitHub does not issue an id_token and has no JWKS/nonce, so identity CANNOT be
 * verified from a JWT. Instead we exchange the auth code for an opaque access_token
 * and call the GitHub REST API (`/user` + `/user/emails`) to establish identity.
 * CSRF is mitigated with a `state` value (GitHub does not support standard PKCE),
 * verified by the caller against the stored state.
 */
import { generateState } from '../utils/pkce-helper.js';
import { loadSsoProviderConfig } from '../utils/sso-config-loader.js';
import type { SsoProviderConfig } from '../models/SsoProviderConfig.js';
import type { NormalizedProfile } from '../models/NormalizedProfile.js';
import {
  GitHubTokenResponseSchema,
  GitHubUserSchema,
  GitHubEmailListSchema,
  type GitHubUser,
  type GitHubEmail,
} from '../models/GitHubProfile.js';
import type {
  SsoProviderStrategy,
  AuthorizeOptions,
  AuthorizeResult,
  CallbackParams,
} from './SsoProviderStrategy.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';
const DEFAULT_SCOPES = ['read:user', 'user:email'];
const USER_AGENT = 'SDLC-Agents-SSO';

/** Raise an Error carrying an HTTP status for the callback handler. */
function fail(message: string, status: number, detail?: string): never {
  const err = new Error(message) as Error & { status: number; detail?: string };
  err.status = status;
  if (detail !== undefined) err.detail = detail;
  throw err;
}

export class GitHubProviderStrategy implements SsoProviderStrategy {
  readonly providerType = 'github';

  async buildAuthorizeUrl(options?: AuthorizeOptions): Promise<AuthorizeResult> {
    const config = await this.requireConfig();
    const clientState = options?.state;
    const state = clientState && clientState.length > 0 ? clientState : generateState();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: this.resolveScopes(config).join(' '),
      state,
      response_type: 'code',
    });
    // No code_verifier/nonce: GitHub OAuth2 does not support PKCE/OIDC nonce.
    return { url: `${AUTHORIZE_URL}?${params.toString()}`, state };
  }

  async handleCallback(params: CallbackParams): Promise<NormalizedProfile> {
    this.assertState(params);
    const config = await this.requireConfig();
    const accessToken = await this.exchangeCode(config, params.code);
    const user = await this.fetchUser(accessToken);
    const email = await this.resolvePrimaryVerifiedEmail(accessToken);
    return this.normalize(user, email);
  }

  /** BR: CSRF defense — stored state must equal the returned state. */
  private assertState(params: CallbackParams): void {
    const expected = params.storedState?.state ?? params.state;
    if (!params.state || !expected || params.state !== expected) {
      fail('invalid_state', 401);
    }
  }

  private resolveScopes(config: SsoProviderConfig): string[] {
    return config.scopes.length > 0 ? config.scopes : DEFAULT_SCOPES;
  }

  private async requireConfig(): Promise<SsoProviderConfig> {
    const config = await loadSsoProviderConfig(this.providerType);
    if (!config) fail('SSO not enabled', 400);
    return config;
  }

  /** Exchange the auth code for an opaque access_token (Accept: application/json). */
  private async exchangeCode(config: SsoProviderConfig, code: string): Promise<string> {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });
    if (!resp.ok) fail('token_exchange_failed', resp.status, await resp.text());
    const parsed = GitHubTokenResponseSchema.safeParse(await resp.json());
    if (!parsed.success) fail('token_response_invalid', 502, parsed.error.message);
    return parsed.data.access_token;
  }

  private async fetchUser(accessToken: string): Promise<GitHubUser> {
    const raw = await this.getJson(USER_URL, accessToken, 'user_fetch_failed');
    const parsed = GitHubUserSchema.safeParse(raw);
    if (!parsed.success) fail('user_response_invalid', 502, parsed.error.message);
    return parsed.data;
  }

  /**
   * Resolve the primary, verified email. `/user` may omit the email (private
   * profile), so `/user/emails` is authoritative for both address and verified flag.
   * @throws invalid_email when no primary+verified email exists (email unverified → reject).
   */
  private async resolvePrimaryVerifiedEmail(accessToken: string): Promise<GitHubEmail> {
    const raw = await this.getJson(EMAILS_URL, accessToken, 'emails_fetch_failed');
    const parsed = GitHubEmailListSchema.safeParse(raw);
    if (!parsed.success) fail('emails_response_invalid', 502, parsed.error.message);
    const primary = parsed.data.find(e => e.primary && e.verified)
      ?? parsed.data.find(e => e.verified);
    if (!primary) fail('email_not_verified', 403);
    return primary;
  }

  /** Authenticated GET returning parsed JSON, with GitHub-required headers. */
  private async getJson(url: string, accessToken: string, errCode: string): Promise<unknown> {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!resp.ok) fail(errCode, resp.status, await resp.text());
    return resp.json();
  }

  /** Map GitHub identity onto the provider-agnostic NormalizedProfile. */
  private normalize(user: GitHubUser, email: GitHubEmail): NormalizedProfile {
    return {
      provider: this.providerType,
      externalSubjectId: String(user.id),
      email: email.email,
      emailVerified: email.verified,
      name: user.name || user.login,
    };
  }
}
