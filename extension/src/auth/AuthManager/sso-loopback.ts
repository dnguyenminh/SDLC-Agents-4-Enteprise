/**
 * AuthManager — SSO loopback (client-initiated) login flow.
 * Opens the browser to /auth/{provider}/login, captures the token on a
 * temporary local callback server, validating host/origin/state (CSRF).
 *
 * Generalized from the original Entra-only flow so adding a provider needs
 * no new client code — the backend route /auth/{provider}/login handles it.
 */

import { AuthError } from "./auth-error";
import type { AuthState } from "./auth-types";
import type { TokenResponse } from "./auth-types";
import {
  completeLogin,
  rejectProviderError,
  rejectStateMismatch,
  rejectUntrustedRemote,
  rejectWrongTarget,
} from "./sso-callback";

/** Collaborators AuthManager provides to the SSO loopback flow. */
export interface SsoFlowDeps {
  getBaseUrl: () => string;
  transitionTo: (state: AuthState) => void;
  adoptTokens: (data: TokenResponse, legacyExpiresAt?: number | null) => Promise<void>;
  onLoginSuccess: () => void;
}

/**
 * Login via any SSO provider using the loopback flow.
 * @param providerType Provider key: 'entra' | 'google' | 'github' | ...
 * @throws AuthError on state mismatch, provider error, timeout, or no token
 */
export async function loginSsoFlow(deps: SsoFlowDeps, providerType: string): Promise<void> {
  if (!providerType || !/^[a-z0-9_-]+$/i.test(providerType)) {
    throw new AuthError(`Invalid SSO provider: ${providerType}`);
  }
  deps.transitionTo("AUTHENTICATING");
  try {
    await runSsoLoopbackFlow(deps, providerType);
  } catch (err) {
    deps.transitionTo("UNAUTHENTICATED");
    if (err instanceof AuthError) { throw err; }
    throw new AuthError(`${providerType} login failed: ${(err as Error).message}`);
  }
}

/** Open the provider login page in the browser, then await the callback token. */
async function runSsoLoopbackFlow(deps: SsoFlowDeps, providerType: string): Promise<void> {
  const crypto = await import("crypto");
  const state = crypto.randomBytes(16).toString("base64url");
  const port = 8765 + Math.floor(Math.random() * 1000);
  const redirectTo = `http://127.0.0.1:${port}/callback`;
  const vscodeMod = await import("vscode");
  const authUrl = `${deps.getBaseUrl()}/auth/${encodeURIComponent(providerType)}/login?state=${encodeURIComponent(state)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  await vscodeMod.env.openExternal(vscodeMod.Uri.parse(authUrl));
  await captureLoopbackCallback(deps, { port, redirectTo, state });
}

/** Create the temporary callback server and await exactly one valid token callback. */
async function captureLoopbackCallback(deps: SsoFlowDeps, params: LoopbackParams): Promise<void> {
  const http = await import("http");
  const guard = new LoopbackServerGuard();
  await new Promise<void>((resolve, reject) => {
    guard.server = http.createServer((req, res) => {
      void handleCallbackRequest(deps, guard, params, req, res, resolve, reject);
    });
    guard.server.on("error", (err: Error) => {
      guard.cleanup();
      reject(new AuthError(`Local server error: ${err.message}`));
    });
    guard.server.listen(params.port, "127.0.0.1", () => {});
    guard.timeoutId = setTimeout(() => {
      guard.cleanup();
      reject(new AuthError("OAuth login timed out"));
    }, 120_000);
  });
}

/** Handle one callback request: validate, respond, then complete or reject the login. */
async function handleCallbackRequest(
  deps: SsoFlowDeps,
  guard: LoopbackServerGuard,
  params: LoopbackParams,
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  resolve: () => void,
  reject: (reason?: unknown) => void,
): Promise<void> {
  try {
    // Prevent token origin issues: validate host header and remote address
    if (rejectUntrustedRemote(req, res, params.port)) { return; }
    const url = new URL(req.url ?? "", params.redirectTo);
    if (rejectWrongTarget(url, res, params.redirectTo)) { return; }
    if (rejectStateMismatch(url, res, params.state, guard, reject)) { return; }
    if (rejectProviderError(url, res, guard, reject)) { return; }
    await completeLogin(deps, guard, url, res, resolve, reject);
  } catch (e) {
    guard.cleanup();
    reject(e);
  }
}

/** Holds the temporary callback server + timeout so cleanup() can release both. */
export class LoopbackServerGuard {
  server: any = null;
  timeoutId: NodeJS.Timeout | null = null;

  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.server) {
      try {
        this.server.close((err: Error | null) => {
          if (err) console.error('[SSO Callback] Server close error:', err.message);
          this.server = null;
        });
      } catch (e) {
        console.error('[SSO Callback] Server close error:', (e as Error).message);
        this.server = null;
      }
    }
  }
}

export interface LoopbackParams {
  port: number;
  redirectTo: string;
  state: string;
}
