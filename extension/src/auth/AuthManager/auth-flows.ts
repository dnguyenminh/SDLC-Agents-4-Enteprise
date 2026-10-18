/**
 * AuthManager — session flows (initialize / login / token access / refresh /
 * logout), extracted from the manager. Each flow operates on an
 * AuthManagerContext with live closures over the manager's state; behavior,
 * order, log strings and error messages are preserved exactly.
 */

import { AuthError } from "./auth-error";
import type { TokenResponse } from "./auth-types";
import type { AuthManagerContext } from "./context";
import {
  LEGACY_SECRET_ACCESS_TOKEN,
  SECRET_ACCESS_TOKEN,
  SECRET_LAST_USERNAME,
  SECRET_REFRESH_TOKEN,
  readMigratedSecret,
} from "./secrets";
import { loginRequest, notifyBackendLogout, refreshRequest, requestCurrentUsername } from "./http-flow";
import { isTokenExpired } from "./token-expiry";
import { adoptTokensFlow } from "./token-adoption";

/**
 * Initialize — clear stale session on startup.
 * User must login explicitly each session (security requirement).
 */
export async function initializeSession(ctx: AuthManagerContext): Promise<void> {
  // Do NOT auto-restore token from SecretStorage.
  // Enrichment data is per-user — must require explicit login each session.
  ctx.setCachedToken(null);
  ctx.setRefreshTokenValue(null);
  ctx.clearAccessRefreshTimer();
  ctx.transitionTo("UNAUTHENTICATED");
}

/**
 * Login with username/password → backend /api/admin/auth/login.
 * Backend returns: { token, user, expiresAt }
 */
export async function loginFlow(ctx: AuthManagerContext, username: string, password: string): Promise<void> {
  ctx.transitionTo("AUTHENTICATING");
  try {
    const response = await loginRequest(ctx.getBaseUrl(), username, password);
    if (!response.ok) {
      ctx.transitionTo("UNAUTHENTICATED");
      const body = await response.text();
      throw new AuthError(`Login failed (${response.status}): ${body}`);
    }
    const data = await response.json() as TokenResponse;
    await ctx.secrets.store(SECRET_LAST_USERNAME, username);
    await adoptTokensFlow(ctx, data);
    ctx.transitionTo("AUTHENTICATED");
    ctx.startRefreshTimer();
  } catch (err) {
    ctx.transitionTo("UNAUTHENTICATED");
    if (err instanceof AuthError) { throw err; }
    throw new AuthError(`Cannot reach backend: ${(err as Error).message}`);
  }
}

/**
 * Get current access token (auto-refreshes if near expiry).
 */
export async function getAccessTokenFlow(ctx: AuthManagerContext): Promise<string | null> {
  if (ctx.getState() !== "AUTHENTICATED") { return null; }
  const token = await readMigratedSecret(ctx.secrets, SECRET_ACCESS_TOKEN, LEGACY_SECRET_ACCESS_TOKEN);
  if (!token) {
    ctx.transitionTo("UNAUTHENTICATED");
    return null;
  }
  if (isTokenExpired(ctx.getTokenExpiresAt(), ctx.getTokenAcquiredAt())) {
    await ctx.refreshToken();
    const refreshed = await ctx.secrets.get(SECRET_ACCESS_TOKEN);
    ctx.setCachedToken(refreshed ?? null);
    return refreshed ?? null;
  }
  ctx.setCachedToken(token);
  return token;
}

/**
 * Refresh the access token using the refresh credential (single attempt).
 */
export async function doRefreshFlow(ctx: AuthManagerContext): Promise<void> {
  const refresh = ctx.getRefreshTokenValue() ?? (await ctx.secrets.get(SECRET_REFRESH_TOKEN)) ?? ctx.getCachedToken();
  if (!refresh) {
    ctx.transitionTo("UNAUTHENTICATED");
    return;
  }
  try {
    const response = await refreshRequest(ctx.getBaseUrl(), refresh);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 400 || response.status === 404) {
        // Refresh credential is dead (rotated away, revoked or expired) — drop
        // BOTH tokens so no caller keeps replaying a token the backend rejects.
        await clearSession(ctx);
      }
      return;
    }
    const data = await response.json() as TokenResponse;
    await adoptTokensFlow(ctx, data);
    // Notify listeners (e.g. iframe panels) that the Bearer token changed.
    ctx.fireTokenRefreshed(ctx.getCachedToken() ?? "");
  } catch (err) {
    console.warn("Failed to refresh token due to network/server issue. Keeping current session.", err);
  }
}

/** Drop local credentials and enter UNAUTHENTICATED without a backend call. */
export async function clearSession(ctx: AuthManagerContext): Promise<void> {
  await ctx.secrets.delete(SECRET_ACCESS_TOKEN);
  await ctx.secrets.delete(SECRET_REFRESH_TOKEN);
  await ctx.secrets.delete(LEGACY_SECRET_ACCESS_TOKEN);
  ctx.setCachedToken(null);
  ctx.setRefreshTokenValue(null);
  ctx.setTokenExpiresAt(null);
  ctx.setTokenAcquiredAt(null);
  ctx.clearAccessRefreshTimer();
  ctx.stopRefreshTimer();
  ctx.transitionTo("UNAUTHENTICATED");
}

/**
 * Logout — notify the backend (best-effort), then clear all stored tokens.
 */
export async function logoutFlow(ctx: AuthManagerContext): Promise<void> {
  // Attempt to notify backend about logout using the refresh credential —
  // that is what the backend revokes (the access JWT dies with the session).
  const refresh = ctx.getRefreshTokenValue() ?? ctx.getCachedToken();
  if (refresh) {
    await notifyBackendLogout(ctx.getBaseUrl(), refresh, ctx.getCachedToken() ?? "");
  }

  // Perform local cleanup regardless of backend response. Delete the legacy
  // key too so a stale pre-rename token cannot be resurrected on next read.
  await clearSession(ctx);
}

/**
 * Resolve the display name of the currently authenticated user from the
 * backend (`GET /api/admin/auth/me`).
 * @returns username, then email, then "" when unavailable (never throws).
 */
export async function fetchCurrentUsernameFlow(ctx: AuthManagerContext): Promise<string> {
  const token = await getAccessTokenFlow(ctx);
  if (!token) return "";
  return requestCurrentUsername(ctx.getBaseUrl(), token);
}
