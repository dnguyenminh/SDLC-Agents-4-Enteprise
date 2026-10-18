/**
 * AuthManager — Authentication state machine for remote backend.
 * Manages token lifecycle using VS Code SecretStorage (OS keychain).
 *
 * Auth endpoint: /api/admin/auth/login
 * Response format (dual-token): { accessToken, refreshToken, token, expiresAt, expiresIn }
 * Back-compat: a legacy single-token response ({ token, expiresAt }) is still accepted.
 *
 * Cohesive flows live in ./AuthManager/ modules; this facade keeps the exact
 * public API and owns the mutable token/session state (single source of truth).
 */

import * as vscode from "vscode";
import { TokenRefreshTimer } from "./TokenRefreshTimer";
import type { SsoProviderInfo } from "./SsoTypes";
import { AuthError } from "./AuthManager/auth-error";
import type { AuthState } from "./AuthManager/auth-types";
import type { AuthManagerContext } from "./AuthManager/context";
import { doRefreshFlow, fetchCurrentUsernameFlow, getAccessTokenFlow, initializeSession, loginFlow, logoutFlow } from "./AuthManager/auth-flows";
import { adoptTokensFlow } from "./AuthManager/token-adoption";
import { loginSsoFlow } from "./AuthManager/sso-loopback";
import { fetchSsoProviders } from "./AuthManager/http-flow";
import { shouldRefreshTokenNow } from "./AuthManager/token-expiry";
import { AccessRefreshScheduler } from "./AuthManager/access-refresh-scheduler";
import { LEGACY_SECRET_LAST_USERNAME, SECRET_LAST_USERNAME, readMigratedSecret } from "./AuthManager/secrets";

export type { AuthState } from "./AuthManager/auth-types";
export { AuthError } from "./AuthManager/auth-error";

export class AuthManager implements vscode.Disposable {
  private state: AuthState = "UNAUTHENTICATED";
  private refreshTimer: TokenRefreshTimer;
  private tokenExpiresAt: number | null = null;
  private tokenAcquiredAt: number | null = null;
  private cachedToken: string | null = null;
  /** Opaque refresh credential — never sent as a Bearer token. */
  private refreshTokenValue: string | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private readonly accessScheduler: AccessRefreshScheduler;
  private readonly ctx: AuthManagerContext;
  private _onStateChange = new vscode.EventEmitter<AuthState>();
  readonly onStateChange: vscode.Event<AuthState> = this._onStateChange.event;
  private _onTokenRefreshed = new vscode.EventEmitter<string>();
  /** Fires with new token string whenever token is successfully refreshed. */
  readonly onTokenRefreshed: vscode.Event<string> = this._onTokenRefreshed.event;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private baseUrl: string
  ) {
    this.refreshTimer = new TokenRefreshTimer(this);
    this.accessScheduler = new AccessRefreshScheduler({
      isAuthenticated: () => this.state === "AUTHENTICATED",
      tokenExpiresAt: () => this.tokenExpiresAt,
      tokenAcquiredAt: () => this.tokenAcquiredAt,
      onDue: () => { void this.refreshToken(); },
    });
    this.ctx = {
      secrets: this.secrets,
      getBaseUrl: () => this.baseUrl,
      getState: () => this.state,
      getTokenExpiresAt: () => this.tokenExpiresAt,
      setTokenExpiresAt: (v) => { this.tokenExpiresAt = v; },
      getTokenAcquiredAt: () => this.tokenAcquiredAt,
      setTokenAcquiredAt: (v) => { this.tokenAcquiredAt = v; },
      getCachedToken: () => this.cachedToken,
      setCachedToken: (v) => { this.cachedToken = v; },
      getRefreshTokenValue: () => this.refreshTokenValue,
      setRefreshTokenValue: (v) => { this.refreshTokenValue = v; },
      transitionTo: (s) => this.transitionTo(s),
      scheduleAccessRefresh: () => this.accessScheduler.schedule(),
      clearAccessRefreshTimer: () => this.accessScheduler.clear(),
      fireTokenRefreshed: (t) => this._onTokenRefreshed.fire(t),
      startRefreshTimer: () => this.refreshTimer.start(),
      stopRefreshTimer: () => this.refreshTimer.stop(),
      refreshToken: () => this.refreshToken(),
    };
  }

  get currentState(): AuthState {
    return this.state;
  }

  /**
   * Point auth at a new backend URL without an extension reload (SA4E-320).
   * All subsequent auth calls (login, refresh, /me) use the new base URL.
   */
  updateBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  get isAuthenticated(): boolean {
    return this.state === "AUTHENTICATED";
  }

  /**
   * Initialize — clear stale session on startup (explicit login required).
   */
  async initialize(): Promise<void> {
    return initializeSession(this.ctx);
  }

  /** Get current access token synchronously from memory cache. */
  getTokenSync(): string {
    return this.cachedToken || "";
  }

  /**
   * Get current access token (auto-refreshes if near expiry).
   */
  async getAccessToken(): Promise<string | null> {
    return getAccessTokenFlow(this.ctx);
  }

  /**
   * Login with username/password → backend /api/admin/auth/login.
   */
  async login(username: string, password: string): Promise<void> {
    return loginFlow(this.ctx, username, password);
  }

  /**
   * List enabled SSO providers (public, pre-login endpoint). Empty on failure.
   */
  async listSsoProviders(): Promise<SsoProviderInfo[]> {
    return fetchSsoProviders(this.baseUrl);
  }

  /**
   * Login via any SSO provider using the loopback (client-initiated) flow.
   * @throws AuthError on state mismatch, provider error, timeout, or no token
   */
  async loginSso(providerType: string): Promise<void> {
    return loginSsoFlow({
      getBaseUrl: () => this.baseUrl,
      transitionTo: (newState) => this.transitionTo(newState),
      adoptTokens: (data, legacyExpiresAt) => adoptTokensFlow(this.ctx, data, legacyExpiresAt),
      onLoginSuccess: () => this.refreshTimer.start(),
    }, providerType);
  }

  /**
   * Backwards-compatible alias for the Entra loopback login flow.
   * Kept so existing callers keep working after generalizing to loginSso.
   */
  async loginEntra(): Promise<void> {
    return this.loginSso("entra");
  }

  /**
   * Get the username from the last successful login.
   */
  async getLastUsername(): Promise<string> {
    return (await readMigratedSecret(this.secrets, SECRET_LAST_USERNAME, LEGACY_SECRET_LAST_USERNAME)) || "";
  }

  /**
   * Resolve the display name from `GET /api/admin/auth/me` (never throws).
   */
  async fetchCurrentUsername(): Promise<string> {
    return fetchCurrentUsernameFlow(this.ctx);
  }

  /**
   * Refresh the access token using the refresh credential.
   * Concurrent callers share one in-flight request (one rotation, not two).
   */
  async refreshToken(): Promise<void> {
    if (this.refreshInFlight) { return this.refreshInFlight; }
    this.refreshInFlight = doRefreshFlow(this.ctx).finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  /**
   * Logout — clear all stored tokens.
   */
  async logout(): Promise<void> {
    return logoutFlow(this.ctx);
  }

  /**
   * Should the token be proactively refreshed now? (See token-expiry.ts.)
   */
  shouldRefreshNow(): boolean {
    return shouldRefreshTokenNow(this.state, this.tokenExpiresAt, this.tokenAcquiredAt);
  }

  private transitionTo(newState: AuthState): void {
    if (this.state === newState) { return; }
    this.state = newState;
    this._onStateChange.fire(newState);
  }

  dispose(): void {
    this.refreshTimer.stop();
    this.accessScheduler.clear();
    this._onStateChange.dispose();
    this._onTokenRefreshed.dispose();
  }
}
