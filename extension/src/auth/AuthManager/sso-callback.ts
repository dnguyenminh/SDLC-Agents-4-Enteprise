/**
 * AuthManager — SSO loopback callback request handling: validation, browser
 * responses and token completion. Extracted from AuthManager.loginSso; every
 * response write, error string and validation order is preserved exactly.
 */

import type { IncomingMessage, ServerResponse } from "http";
import * as vscode from "vscode";
import { AuthError } from "./auth-error";
import type { TokenResponse } from "./auth-types";
import { exchangeAuthCode } from "./http-flow";
import type { LoopbackParams, LoopbackServerGuard, SsoFlowDeps } from "./sso-loopback";

/**
 * Validate host header and loopback remote address.
 * Writes the 400/403 response and returns true when the request is rejected.
 */
export function rejectUntrustedRemote(req: IncomingMessage, res: ServerResponse, port: number): boolean {
  const hostHeader = req.headers.host;
  if (hostHeader !== `127.0.0.1:${port}`) {
    res.writeHead(400);
    res.end("Invalid host");
    return true;
  }
  const remoteAddr = req.socket.remoteAddress || "";
  const isLocal = remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr.startsWith("::ffff:127.0.0.1");
  if (!isLocal) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }
  return false;
}

/**
 * Validate origin and pathname to prevent token leakage.
 * Writes the 400/404 response and returns true when the request is rejected.
 */
export function rejectWrongTarget(url: URL, res: ServerResponse, redirectTo: string): boolean {
  if (url.origin !== new URL(redirectTo).origin) {
    res.writeHead(400);
    res.end("Invalid origin");
    return true;
  }
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return true;
  }
  return false;
}

/** Validate the state parameter to prevent CSRF; tear down and reject on mismatch. */
export function rejectStateMismatch(url: URL, res: ServerResponse, state: string, guard: LoopbackServerGuard, reject: (reason?: unknown) => void): boolean {
  const returnedState = url.searchParams.get("state");
  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<html><body>Invalid state parameter.</body></html>");
    guard.cleanup();
    reject(new AuthError("Invalid state parameter - possible CSRF attack"));
    return true;
  }
  return false;
}

/** Provider-reported error (`?error=`) — respond, notify (SSO disabled), tear down, reject. */
export function rejectProviderError(url: URL, res: ServerResponse, guard: LoopbackServerGuard, reject: (reason?: unknown) => void): boolean {
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store"
    });
    res.end("<html><body>Authentication cancelled or failed. You can close this window.</body></html>");
    guard.cleanup();
    const message = errorDescription ? `${error}: ${errorDescription}` : error;
    // Fallback notification when SSO disabled
    if (error === "sso_disabled" || error === "access_denied" || message.toLowerCase().includes("sso")) {
      vscode.window.showWarningMessage(`SSO is disabled or unavailable: ${message}`);
    }
    reject(new AuthError(`Entra login error: ${message}`));
    return true;
  }
  return false;
}

/** Token parameters carried by the callback query string. */
interface CallbackTokenParams {
  code: string | null;
  token: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
}

function extractCallbackParams(url: URL): CallbackTokenParams {
  return {
    code: url.searchParams.get("sso_code"),
    token: url.searchParams.get("token"),
    accessToken: url.searchParams.get("accessToken"),
    refreshToken: url.searchParams.get("refreshToken"),
    expiresAt: url.searchParams.get("expiresAt"),
  };
}

/** Respond immediately to avoid the browser hanging, then release the server. */
function respondCallbackAccepted(res: ServerResponse, guard: LoopbackServerGuard): void {
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache"
  });
  res.end("<html><body>Authentication complete. You can close this window.</body></html>");
  guard.cleanup();
}

/** Redeem the single-use `sso_code`; rejects (and returns null) on exchange failure. */
async function exchangeCallbackCode(deps: SsoFlowDeps, cb: CallbackTokenParams, reject: (reason?: unknown) => void): Promise<TokenResponse | null> {
  const payload = await exchangeAuthCode(deps.getBaseUrl(), cb.code as string);
  if (!payload) {
    deps.transitionTo("UNAUTHENTICATED");
    reject(new AuthError("Authorization code exchange failed"));
  }
  return payload;
}

/** Adopt the callback token pair (exchanged payload or bare query tokens). */
async function adoptCallbackTokens(deps: SsoFlowDeps, cb: CallbackTokenParams, payload: TokenResponse | null): Promise<void> {
  await deps.adoptTokens(payload ?? {
    token: cb.token ?? undefined,
    accessToken: cb.accessToken ?? undefined,
    refreshToken: cb.refreshToken ?? undefined,
  }, cb.expiresAt ? new Date(cb.expiresAt).getTime() : null);
}

/** Respond to the browser, adopt the returned token pair, then finish the login. */
export async function completeLogin(
  deps: SsoFlowDeps,
  guard: LoopbackServerGuard,
  url: URL,
  res: ServerResponse,
  resolve: () => void,
  reject: (reason?: unknown) => void,
): Promise<void> {
  const cb = extractCallbackParams(url);
  // Respond immediately to avoid browser hanging, then process token
  respondCallbackAccepted(res, guard);

  if (!cb.code && !cb.token && !cb.accessToken) {
    reject(new AuthError("No token returned from backend"));
    return;
  }

  const payload = cb.code ? await exchangeCallbackCode(deps, cb, reject) : null;
  if (cb.code && !payload) { return; }

  await adoptCallbackTokens(deps, cb, payload);
  deps.transitionTo("AUTHENTICATED");
  deps.onLoginSuccess();
  resolve();
}
