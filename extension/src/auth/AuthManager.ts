/**
 * AuthManager — Authentication state machine for remote backend.
 * Manages token lifecycle using VS Code SecretStorage (OS keychain).
 *
 * Auth endpoint: /api/admin/auth/login
 * Response format (dual-token): { accessToken, refreshToken, token, expiresAt, expiresIn }
 * Back-compat: a legacy single-token response ({ token, expiresAt }) is still accepted.
 */

import * as vscode from "vscode";
import { TokenRefreshTimer } from "./TokenRefreshTimer";
import type { SsoProviderInfo } from "./SsoTypes";

export type AuthState = "UNAUTHENTICATED" | "AUTHENTICATING" | "AUTHENTICATED";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const SECRET_ACCESS_TOKEN = "sdlcAgents.accessToken";
/** Opaque refresh credential stored beside the access token (dual-token). */
const SECRET_REFRESH_TOKEN = "sdlcAgents.refreshToken";
const SECRET_LAST_USERNAME = "sdlcAgents.lastUsername";
/** Pre-rename secret keys — READ-ONLY migration/fallback sources. */
const LEGACY_SECRET_ACCESS_TOKEN = "kiroSdlc.accessToken";
const LEGACY_SECRET_LAST_USERNAME = "kiroSdlc.lastUsername";

/** Refresh at 70% of the access token lifetime, leaving headroom for retries. */
const ACCESS_REFRESH_FRACTION = 0.7;

/** Shapes returned by /login and /refresh (accessToken/refreshToken absent on legacy backends). */
interface TokenResponse {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  expiresIn?: number;
}

export class AuthManager implements vscode.Disposable {
  private state: AuthState = "UNAUTHENTICATED";
  private refreshTimer: TokenRefreshTimer;
  private tokenExpiresAt: number | null = null;
  private tokenAcquiredAt: number | null = null;
  private cachedToken: string | null = null;
  /** Opaque refresh credential — never sent as a Bearer token. */
  private refreshTokenValue: string | null = null;
  private accessRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
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
  }

  get currentState(): AuthState {
    return this.state;
  }

  /**
   * Point auth at a new backend URL without an extension reload (SA4E-320).
   * All subsequent auth calls (login, refresh, /me) use the new base URL.
   * No-op when the URL is unchanged.
   * @param url New backend base URL (trailing slash already stripped by caller).
   */
  updateBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  get isAuthenticated(): boolean {
    return this.state === "AUTHENTICATED";
  }

  /**
   * Initialize — clear stale session on startup.
   * User must login explicitly each session (security requirement).
   */
  async initialize(): Promise<void> {
    // Do NOT auto-restore token from SecretStorage.
    // Enrichment data is per-user — must require explicit login each session.
    this.cachedToken = null;
    this.refreshTokenValue = null;
    this.clearAccessRefreshTimer();
    this.transitionTo("UNAUTHENTICATED");
  }

  /**
   * Adopt a login/refresh response: dual-token when the backend provides
   * accessToken/refreshToken, legacy single-token otherwise.
   */
  private async adoptTokens(data: TokenResponse, legacyExpiresAt?: number | null): Promise<void> {
    const refresh = data.refreshToken ?? data.token ?? null;
    const access = data.accessToken ?? data.token ?? null;
    if (refresh) {
      this.refreshTokenValue = refresh;
      await this.secrets.store(SECRET_REFRESH_TOKEN, refresh);
    }
    if (access) {
      this.cachedToken = access;
      await this.secrets.store(SECRET_ACCESS_TOKEN, access);
    }
    this.tokenAcquiredAt = Date.now();
    this.tokenExpiresAt = data.accessToken
      ? Date.now() + (data.expiresIn && data.expiresIn > 0 ? data.expiresIn : 900) * 1000
      : data.expiresAt
        ? new Date(data.expiresAt).getTime()
        : legacyExpiresAt ?? null;
    this.scheduleAccessRefresh();
  }

  /** Refresh exactly once at ACCESS_REFRESH_FRACTION of the access token lifetime. */
  private scheduleAccessRefresh(): void {
    this.clearAccessRefreshTimer();
    if (this.state !== "AUTHENTICATED" || !this.tokenExpiresAt || !this.tokenAcquiredAt) return;
    const lifetime = this.tokenExpiresAt - this.tokenAcquiredAt;
    if (lifetime <= 0) return;
    const dueAt = this.tokenAcquiredAt + lifetime * ACCESS_REFRESH_FRACTION;
    const delay = Math.max(1_000, dueAt - Date.now());
    this.accessRefreshTimer = setTimeout(() => {
      this.accessRefreshTimer = null;
      void this.refreshToken();
    }, delay);
  }

  private clearAccessRefreshTimer(): void {
    if (this.accessRefreshTimer) {
      clearTimeout(this.accessRefreshTimer);
      this.accessRefreshTimer = null;
    }
  }

  /**
   * Get current access token synchronously from memory cache.
   */
  getTokenSync(): string {
    return this.cachedToken || "";
  }

  /**
   * Read a secret from the new key, migrating a legacy value on read.
   * When the new key is empty but a pre-rename `kiroSdlc.*` value exists, the
   * value is copied to the new key (migrate-on-read) and returned. A store
   * failure is logged, not thrown, so a read never breaks auth (fail-open read).
   * @param newKey Current `sdlcAgents.*` secret key.
   * @param legacyKey Pre-rename `kiroSdlc.*` fallback key.
   * @returns The stored secret, or undefined when neither key is set.
   */
  private async readMigratedSecret(newKey: string, legacyKey: string): Promise<string | undefined> {
    const current = await this.secrets.get(newKey);
    if (current) { return current; }
    const legacy = await this.secrets.get(legacyKey);
    if (!legacy) { return undefined; }
    try { await this.secrets.store(newKey, legacy); }
    catch (err) { console.warn(`Failed to migrate secret ${newKey}:`, (err as Error).message); }
    return legacy;
  }

  /**
   * Get current access token (auto-refreshes if near expiry).
   */
  async getAccessToken(): Promise<string | null> {
    if (this.state !== "AUTHENTICATED") { return null; }
    const token = await this.readMigratedSecret(SECRET_ACCESS_TOKEN, LEGACY_SECRET_ACCESS_TOKEN);
    if (!token) {
      this.transitionTo("UNAUTHENTICATED");
      return null;
    }
    if (this.isExpired()) {
      await this.refreshToken();
      const refreshed = await this.secrets.get(SECRET_ACCESS_TOKEN);
      this.cachedToken = refreshed ?? null;
      return refreshed ?? null;
    }
    this.cachedToken = token;
    return token;
  }

  /**
   * Login with username/password → backend /api/admin/auth/login.
   * Backend returns: { token, user, expiresAt }
   */
  async login(username: string, password: string): Promise<void> {
    this.transitionTo("AUTHENTICATING");
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/auth/login`, {
        method: "POST",
        // SA4E-319: mark this as an extension-issued session. The backend then does NOT
        // bind the session to a user-agent, because the SAME token is used by two
        // legitimate clients — the extension host (Node) AND the webview iframe
        // (Chromium) which have different user-agents. UA-binding stays ON for the
        // public SSO browser flow (no X-Client-Type header there).
        headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        this.transitionTo("UNAUTHENTICATED");
        const body = await response.text();
        throw new AuthError(`Login failed (${response.status}): ${body}`);
      }
       const data = await response.json() as TokenResponse;
       await this.secrets.store(SECRET_LAST_USERNAME, username);
       await this.adoptTokens(data);
       this.transitionTo("AUTHENTICATED");
       this.refreshTimer.start();
    } catch (err) {
      this.transitionTo("UNAUTHENTICATED");
      if (err instanceof AuthError) { throw err; }
      throw new AuthError(`Cannot reach backend: ${(err as Error).message}`);
    }
  }

  /**
   * List enabled SSO providers from the backend (public, pre-login endpoint).
   * Used by the login panel to render provider buttons dynamically.
   * @returns Array of enabled providers (safe fields only). Empty on failure.
   */
  async listSsoProviders(): Promise<SsoProviderInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/sso/providers`);
      if (!response.ok) { return []; }
      const data = await response.json() as { providers?: SsoProviderInfo[] };
      // Backend already filters to enabled=1; guard against nulls defensively.
      return (data.providers ?? []).filter((p) => p && p.provider_type);
    } catch (err) {
      // Non-fatal: login panel still shows username/password + Entra button.
      console.warn("Failed to list SSO providers:", (err as Error).message);
      return [];
    }
  }

  /**
   * Login via any SSO provider using the loopback (client-initiated) flow.
   * Opens the browser to /auth/{provider}/login, captures the token on a
   * temporary local callback server, validating host/origin/state (CSRF).
   *
   * Generalized from the original Entra-only flow so adding a provider needs
   * no new client code — the backend route /auth/{provider}/login handles it.
   *
   * @param providerType Provider key: 'entra' | 'google' | 'github' | ...
   * @throws AuthError on state mismatch, provider error, timeout, or no token
   */
  async loginSso(providerType: string): Promise<void> {
    if (!providerType || !/^[a-z0-9_-]+$/i.test(providerType)) {
      throw new AuthError(`Invalid SSO provider: ${providerType}`);
    }
    this.transitionTo("AUTHENTICATING");
    try {
      const crypto = await import("crypto");
      const state = crypto.randomBytes(16).toString("base64url");
      const port = 8765 + Math.floor(Math.random() * 1000);
      const redirectTo = `http://127.0.0.1:${port}/callback`;
      const vscodeMod = await import("vscode");
      const authUrl = `${this.baseUrl}/auth/${encodeURIComponent(providerType)}/login?state=${encodeURIComponent(state)}&redirect_to=${encodeURIComponent(redirectTo)}`;
      await vscodeMod.env.openExternal(vscodeMod.Uri.parse(authUrl));
      const http = await import("http");
      let server: any = null;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (server) {
          try {
            server.close();
          } catch {}
          server = null;
        }
      };

      await new Promise<void>((resolve, reject) => {
        server = http.createServer(async (req, res) => {
          try {
            // Prevent token origin issues: validate host header and remote address
            const hostHeader = req.headers.host;
            if (hostHeader !== `127.0.0.1:${port}`) {
              res.writeHead(400);
              res.end("Invalid host");
              return;
            }
            const remoteAddr = req.socket.remoteAddress || "";
            const isLocal = remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr.startsWith("::ffff:127.0.0.1");
            if (!isLocal) {
              res.writeHead(403);
              res.end("Forbidden");
              return;
            }

            const url = new URL(req.url ?? "", redirectTo);
            // Validate origin to prevent token leakage
            if (url.origin !== new URL(redirectTo).origin) {
              res.writeHead(400);
              res.end("Invalid origin");
              return;
            }
            if (url.pathname !== "/callback") {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            // Validate state parameter to prevent CSRF
            const returnedState = url.searchParams.get("state");
            if (returnedState !== state) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end("<html><body>Invalid state parameter.</body></html>");
              cleanup();
              reject(new AuthError("Invalid state parameter - possible CSRF attack"));
              return;
            }

            const error = url.searchParams.get("error");
            const errorDescription = url.searchParams.get("error_description");
            if (error) {
              res.writeHead(200, {
                "Content-Type": "text/html",
                "Cache-Control": "no-store"
              });
              res.end("<html><body>Authentication cancelled or failed. You can close this window.</body></html>");
              cleanup();
              const message = errorDescription ? `${error}: ${errorDescription}` : error;
              // Fallback notification when SSO disabled
              if (error === "sso_disabled" || error === "access_denied" || message.toLowerCase().includes("sso")) {
                vscodeMod.window.showWarningMessage(`SSO is disabled or unavailable: ${message}`);
              }
              reject(new AuthError(`Entra login error: ${message}`));
              return;
            }

            const code = url.searchParams.get("sso_code");
            const token = url.searchParams.get("token");
            const accessToken = url.searchParams.get("accessToken");
            const refreshToken = url.searchParams.get("refreshToken");
            const expiresAt = url.searchParams.get("expiresAt");

            // Respond immediately to avoid browser hanging, then process token
            res.writeHead(200, {
              "Content-Type": "text/html",
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "Pragma": "no-cache"
            });
            res.end("<html><body>Authentication complete. You can close this window.</body></html>");
            cleanup();

            if (!code && !token && !accessToken) {
              reject(new AuthError("No token returned from backend"));
              return;
            }

            let payload: TokenResponse | null = null;
            if (code) {
              payload = await this.exchangeAuthCode(code);
              if (!payload) {
                this.transitionTo("UNAUTHENTICATED");
                reject(new AuthError("Authorization code exchange failed"));
                return;
              }
            }
             await this.adoptTokens(payload ?? {
               token: token ?? undefined,
               accessToken: accessToken ?? undefined,
               refreshToken: refreshToken ?? undefined,
             }, expiresAt ? new Date(expiresAt).getTime() : null);
             this.transitionTo("AUTHENTICATED");
             this.refreshTimer.start();
            resolve();
          } catch (e) {
            cleanup();
            reject(e);
          }
        });

        server.on("error", (err: Error) => {
          cleanup();
          reject(new AuthError(`Local server error: ${err.message}`));
        });

        server.listen(port, "127.0.0.1", () => {});

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new AuthError("OAuth login timed out"));
        }, 120_000);
      });
    } catch (err) {
      this.transitionTo("UNAUTHENTICATED");
      if (err instanceof AuthError) { throw err; }
      throw new AuthError(`${providerType} login failed: ${(err as Error).message}`);
    }
  }

  /**
   * Backwards-compatible alias for the Entra loopback login flow.
   * Kept so existing callers keep working after generalizing to loginSso.
   */
  async loginEntra(): Promise<void> {
    return this.loginSso("entra");
  }

  /**
   * Redeem a single-use `sso_code` from the login redirect for the token pair.
   * The credential travels in the request body, never in a URL.
   * @returns Token payload or null when the code is unknown/expired/reused.
   */
  private async exchangeAuthCode(code: string): Promise<TokenResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) return null;
      return await response.json() as TokenResponse;
    } catch (err) {
      console.warn("Auth code exchange failed:", (err as Error).message);
      return null;
    }
  }

  /**
   * Get the username from the last successful login.
   */
  async getLastUsername(): Promise<string> {
    return (await this.readMigratedSecret(SECRET_LAST_USERNAME, LEGACY_SECRET_LAST_USERNAME)) || "";
  }

  /**
   * Resolve the display name of the currently authenticated user from the
   * backend (`GET /api/admin/auth/me`). Works for BOTH password and SSO sessions
   * because both issue the same session token — so the sidebar shows the real
   * user (e.g. an Entra/Google account) instead of a hardcoded name.
   * @returns username, then email, then "" when unavailable (never throws).
   */
   async fetchCurrentUsername(): Promise<string> {
     const token = await this.getAccessToken();
     if (!token) return "";
     try {
      const response = await fetch(`${this.baseUrl}/api/admin/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return "";
      const data = await response.json() as { username?: string; email?: string };
      return data.username || data.email || "";
    } catch (err) {
      // Non-fatal: caller falls back to an empty label rather than blocking auth.
      console.warn("Failed to fetch current user:", (err as Error).message);
      return "";
    }
  }

  /**
   * Refresh the access token using the refresh credential.
   * Concurrent callers share one in-flight request (one rotation, not two).
   */
  async refreshToken(): Promise<void> {
    if (this.refreshInFlight) { return this.refreshInFlight; }
    this.refreshInFlight = this.doRefresh().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<void> {
    const refresh = this.refreshTokenValue ?? (await this.secrets.get(SECRET_REFRESH_TOKEN)) ?? this.cachedToken;
    if (!refresh) {
      this.transitionTo("UNAUTHENTICATED");
      return;
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        // SA4E-319: same extension-client marker so refresh doesn't get rejected by
        // UA-binding (the extension host UA differs from the login/webview UA).
        headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 400 || response.status === 404) {
          // Refresh credential is dead (rotated away, revoked or expired) — drop
          // BOTH tokens so no caller keeps replaying a token the backend rejects.
          await this.clearSession();
        }
        return;
      }
      const data = await response.json() as TokenResponse;
      await this.adoptTokens(data);
      // Notify listeners (e.g. iframe panels) that the Bearer token changed.
      this._onTokenRefreshed.fire(this.cachedToken ?? "");
    } catch (err) {
      console.warn("Failed to refresh token due to network/server issue. Keeping current session.", err);
    }
  }

  /** Drop local credentials and enter UNAUTHENTICATED without a backend call. */
  private async clearSession(): Promise<void> {
    await this.secrets.delete(SECRET_ACCESS_TOKEN);
    await this.secrets.delete(SECRET_REFRESH_TOKEN);
    await this.secrets.delete(LEGACY_SECRET_ACCESS_TOKEN);
    this.cachedToken = null;
    this.refreshTokenValue = null;
    this.tokenExpiresAt = null;
    this.tokenAcquiredAt = null;
    this.clearAccessRefreshTimer();
    this.refreshTimer.stop();
    this.transitionTo("UNAUTHENTICATED");
  }

  /**
   * Logout — clear all stored tokens.
   */
  async logout(): Promise<void> {
    // Attempt to notify backend about logout using the refresh credential —
    // that is what the backend revokes (the access JWT dies with the session).
    const refresh = this.refreshTokenValue ?? this.cachedToken;
    if (refresh) {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.cachedToken ?? ""}` },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!response.ok) {
          const body = await response.text();
          console.error(`Logout request failed (${response.status}): ${body}`);
        }
      } catch (err) {
        console.error(`Logout request error: ${(err as Error).message}`);
      }
    }

    // Perform local cleanup regardless of backend response. Delete the legacy
    // key too so a stale pre-rename token cannot be resurrected on next read.
    await this.clearSession();
  }

  private isExpired(): boolean {
    if (!this.tokenExpiresAt) {
      if (!this.tokenAcquiredAt) return false;
      return Date.now() > this.tokenAcquiredAt + 3_600_000;
    }
    return Date.now() > this.tokenExpiresAt - 60_000;
  }

  /**
   * Should the token be proactively refreshed now? True once the token has
   * entered the last quarter of its lifetime (or the last 10 min if lifetime is
   * short). This avoids rotating the session token too eagerly — the backend
   * rotation invalidates the old token, which would break in-flight long
   * operations (e.g. a Pega crawl) that are still holding it.
   */
  shouldRefreshNow(): boolean {
    if (this.state !== "AUTHENTICATED") return false;
    if (!this.tokenExpiresAt) {
      // No expiry known — fall back to refreshing after ~45 min of a 60 min assumption.
      if (!this.tokenAcquiredAt) return false;
      return Date.now() > this.tokenAcquiredAt + 45 * 60_000;
    }
    const acquired = this.tokenAcquiredAt ?? (this.tokenExpiresAt - 24 * 3_600_000);
    const lifetime = Math.max(this.tokenExpiresAt - acquired, 60_000);
    const threshold = this.tokenExpiresAt - Math.min(lifetime * 0.25, 6 * 3_600_000);
    return Date.now() >= threshold;
  }

  private transitionTo(newState: AuthState): void {
    if (this.state === newState) { return; }
    this.state = newState;
    this._onStateChange.fire(newState);
  }

  dispose(): void {
    this.refreshTimer.stop();
    this.clearAccessRefreshTimer();
    this._onStateChange.dispose();
    this._onTokenRefreshed.dispose();
  }
}

