/**
 * AuthManager — Authentication state machine for remote backend.
 * Manages token lifecycle using VS Code SecretStorage (OS keychain).
 *
 * Auth endpoint: /api/admin/auth/login
 * Response format: { token, user, expiresAt }
 */

import * as vscode from "vscode";
import { TokenRefreshTimer } from "./TokenRefreshTimer";

export type AuthState = "UNAUTHENTICATED" | "AUTHENTICATING" | "AUTHENTICATED";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const SECRET_ACCESS_TOKEN = "kiroSdlc.accessToken";

export class AuthManager implements vscode.Disposable {
  private state: AuthState = "UNAUTHENTICATED";
  private refreshTimer: TokenRefreshTimer;
  private tokenExpiresAt: number | null = null;
  private tokenAcquiredAt: number | null = null;
  private cachedToken: string | null = null;
  private _onStateChange = new vscode.EventEmitter<AuthState>();
  readonly onStateChange: vscode.Event<AuthState> = this._onStateChange.event;

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
   * Initialize from stored credentials on activation.
   */
  async initialize(): Promise<void> {
    const token = await this.secrets.get(SECRET_ACCESS_TOKEN);
    if (token && !this.isExpired()) {
      this.cachedToken = token;
      this.transitionTo("AUTHENTICATED");
      this.refreshTimer.start();
    }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        this.transitionTo("UNAUTHENTICATED");
        const body = await response.text();
        throw new AuthError(`Login failed (${response.status}): ${body}`);
      }
      const data = await response.json() as { token: string; user: unknown; expiresAt: string };
      await this.secrets.store(SECRET_ACCESS_TOKEN, data.token);
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
        headers: { "Content-Type": "application/json" },
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

  private transitionTo(newState: AuthState): void {
    if (this.state === newState) { return; }
    this.state = newState;
    this._onStateChange.fire(newState);
  }

  dispose(): void {
    this.refreshTimer.stop();
    this._onStateChange.dispose();
  }
}

