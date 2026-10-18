/**
 * AuthManager — one HTTP call per function, extracted from the manager.
 * Headers, payloads, log strings and error strings are preserved exactly.
 */

import type { SsoProviderInfo } from "../SsoTypes";
import type { TokenResponse } from "./auth-types";

export async function loginRequest(baseUrl: string, username: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/auth/login`, {
    method: "POST",
    // SA4E-319: mark this as an extension-issued session. The backend then does NOT
    // bind the session to a user-agent, because the SAME token is used by two
    // legitimate clients — the extension host (Node) AND the webview iframe
    // (Chromium) which have different user-agents. UA-binding stays ON for the
    // public SSO browser flow (no X-Client-Type header there).
    headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
    body: JSON.stringify({ username, password }),
  });
}

/**
 * Redeem a single-use `sso_code` from the login redirect for the token pair.
 * The credential travels in the request body, never in a URL.
 * @returns Token payload or null when the code is unknown/expired/reused.
 */
export async function exchangeAuthCode(baseUrl: string, code: string): Promise<TokenResponse | null> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/exchange`, {
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
 * Resolve the display name of the currently authenticated user from the
 * backend (`GET /api/admin/auth/me`).
 * @returns username, then email, then "" when unavailable (never throws).
 */
export async function requestCurrentUsername(baseUrl: string, token: string): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/api/admin/auth/me`, {
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
 * List enabled SSO providers from the backend (public, pre-login endpoint).
 * @returns Array of enabled providers (safe fields only). Empty on failure.
 */
export async function fetchSsoProviders(baseUrl: string): Promise<SsoProviderInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/auth/sso/providers`);
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

/** POST the refresh credential to /api/auth/refresh (SA4E-319 extension marker). */
export async function refreshRequest(baseUrl: string, refresh: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
    // SA4E-319: same extension-client marker so refresh doesn't get rejected by
    // UA-binding (the extension host UA differs from the login/webview UA).
    headers: { "Content-Type": "application/json", "X-Client-Type": "extension" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
}

/** Best-effort backend logout notification (never throws). */
export async function notifyBackendLogout(baseUrl: string, refresh: string, bearer: string): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${bearer}` },
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
