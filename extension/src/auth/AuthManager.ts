/**
 * AuthManager — Authentication state machine for remote backend.
 * Manages token lifecycle using VS Code SecretStorage (OS keychain).
 *
 * Auth endpoint: /api/admin/auth/login
 * Response format: { token, user, expiresAt }
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

const SECRET_ACCESS_TOKEN = "kiroSdlc.accessToken";
const SECRET_LAST_USERNAME = "kiroSdlc.lastUsername";

export class AuthManager implements vscode.Disposable {
  private state: AuthState = "UNAUTHENTICATED";
  private refreshTimer: TokenRefreshTimer;
  private tokenExpiresAt: number | null = null;
  private tokenAcquiredAt: number | null = null;
  private cachedToken: string | null = null;
  private _onStateChange = new vscode.EventEmitter<AuthState>();
  readonly onStateChange: vscode.Event<AuthState> = this._onStateChange.event;
  private _onTokenRefreshed = new vscode.EventEmitter<string>();
  /** Fires with new token string whenever token is successfully refreshed. */
  readonly onTokenRefreshed: vscode.Event<string> = this._onTokenRefreshed.event;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly baseUrl: string
  ) {
    this.refreshTimer = new TokenRefreshTimer(this);
  }

  get currentState(): AuthState {
    return this.state;
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
    this.transitionTo("UNAUTHENTICATED");
  }

  /**
   * Get current access token synchronously from memory cache.
   */
  getTokenSync(): string {
    return this.cachedToken || "";
  }

  /**
   * Get current access token (auto-refreshes if near expiry).
   */
  async getAccessToken(): Promise<string | null> {
    if (this.state !== "AUTHENTICATED") { return null; }
    const token = await this.secrets.get(SECRET_ACCESS_TOKEN);
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
      const data = await response.json() as { token: string; user: unknown; expiresAt: string };
      await this.secrets.store(SECRET_ACCESS_TOKEN, data.token);
      await this.secrets.store(SECRET_LAST_USERNAME, username);
      this.cachedToken = data.token;
      this.tokenAcquiredAt = Date.now();
      // expiresAt is ISO string — store as epoch ms (null if backend omits it)
      this.tokenExpiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
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

            const token = url.searchParams.get("token");
            const expiresAt = url.searchParams.get("expiresAt");

            // Respond immediately to avoid browser hanging, then process token
            res.writeHead(200, {
              "Content-Type": "text/html",
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "Pragma": "no-cache"
            });
            res.end("<html><body>Authentication complete. You can close this window.</body></html>");
            cleanup();

            if (!token) {
              reject(new AuthError("No token returned from backend"));
              return;
            }

            await this.secrets.store(SECRET_ACCESS_TOKEN, token);
            this.cachedToken = token;
            this.tokenAcquiredAt = Date.now();
            this.tokenExpiresAt = expiresAt ? new Date(expiresAt).getTime() : null;
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
   * Get the username from the last successful login.
   */
  async getLastUsername(): Promise<string> {
    return (await this.secrets.get(SECRET_LAST_USERNAME)) || "";
  }

  /**
   * Resolve the display name of the currently authenticated user from the
   * backend (`GET /api/admin/auth/me`). Works for BOTH password and SSO sessions
   * because both issue the same session token — so the sidebar shows the real
   * user (e.g. an Entra/Google account) instead of a hardcoded name.
   * @returns username, then email, then "" when unavailable (never throws).
   */
  async fetchCurrentUsername(): Promise<string> {
    const token = this.cachedToken;
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
   * Refresh the access token using refresh endpoint.
   */
  async refreshToken(): Promise<void> {
    if (!this.cachedToken) {
      this.transitionTo("UNAUTHENTICATED");
      return;
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        // SA4E-319: same extension-client marker so refresh doesn't get rejected by
        // UA-binding (the extension host UA differs from the login/webview UA).
        headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
        body: JSON.stringify({ refresh_token: this.cachedToken }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 400 || response.status === 404) {
          this.transitionTo("UNAUTHENTICATED");
        }
        return;
      }
      const data = await response.json() as { token: string; expiresAt?: string };
      await this.secrets.store(SECRET_ACCESS_TOKEN, data.token);
      this.cachedToken = data.token;
      this.tokenAcquiredAt = Date.now();
      if (data.expiresAt) {
        this.tokenExpiresAt = new Date(data.expiresAt).getTime();
      }
      // Notify listeners (e.g. iframe panels) that token has been refreshed
      this._onTokenRefreshed.fire(data.token);
    } catch (err) {
      console.warn("Failed to refresh token due to network/server issue. Keeping current session.", err);
    }
  }

  /**
   * Logout — clear all stored tokens.
   */
  async logout(): Promise<void> {
    // Attempt to notify backend about logout using current access token.
    // Errors are logged but do not block local cleanup.
    if (this.cachedToken) {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.cachedToken }),
        });
        if (!response.ok) {
          const body = await response.text();
          console.error(`Logout request failed (${response.status}): ${body}`);
        }
      } catch (err) {
        console.error(`Logout request error: ${(err as Error).message}`);
      }
    }

    // Perform local cleanup regardless of backend response.
    await this.secrets.delete(SECRET_ACCESS_TOKEN);
    this.cachedToken = null;
    this.tokenExpiresAt = null;
    this.tokenAcquiredAt = null;
    this.refreshTimer.stop();
    this.transitionTo("UNAUTHENTICATED");
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
    this._onStateChange.dispose();
    this._onTokenRefreshed.dispose();
  }
}

